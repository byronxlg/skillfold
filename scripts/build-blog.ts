/**
 * Static blog generator for site/.
 *
 * Reads markdown posts from site/blog/posts/*.md, renders them into
 * site/blog/<slug>/index.html, and writes site/blog/index.html plus
 * site/feed.xml. Output is generated, never committed - CI runs this
 * before uploading the Pages artifact.
 *
 *   npm run build:blog
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { parse as parseYaml } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SITE = join(ROOT, "site");
const POSTS_DIR = join(SITE, "blog", "posts");
const BLOG_DIR = join(SITE, "blog");

const SITE_URL = "https://byronxlg.github.io/skillfold/";
const BLOG_TITLE = "skillfold blog";
const BLOG_DESC =
  "Notes on managing Claude skills the way you manage dependencies: manifests, lockfiles, and reproducible installs.";

const marked = new Marked({ gfm: true });

interface Post {
  slug: string;
  title: string;
  description: string;
  date: Date;
  dateRaw: string;
  tags: string[];
  html: string;
  file: string;
}

class BuildError extends Error {}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Split `---\n...\n---\n` frontmatter off the top of a markdown file. */
function splitFrontmatter(raw: string, file: string): { data: unknown; body: string } {
  const text = raw.replace(/^﻿/, "");
  if (!text.startsWith("---\n")) {
    throw new BuildError(`${file}: missing YAML frontmatter (must start with "---")`);
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) throw new BuildError(`${file}: frontmatter is never closed with "---"`);
  const body = text.slice(text.indexOf("\n", end + 1) + 1);
  return { data: parseYaml(text.slice(4, end)), body };
}

function requireString(data: Record<string, unknown>, key: string, file: string): string {
  const v = data[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new BuildError(`${file}: frontmatter "${key}" is required and must be a non-empty string`);
  }
  return v.trim();
}

function parseDate(raw: string, file: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BuildError(`${file}: frontmatter "date" must be YYYY-MM-DD, got "${raw}"`);
  }
  // Noon UTC so the rendered day never shifts with the reader's timezone.
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new BuildError(`${file}: "date" is not a real date: ${raw}`);
  return d;
}

/** Give h2/h3 stable ids so sections are linkable. */
function addHeadingIds(html: string): string {
  const seen = new Set<string>();
  return html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level: string, inner: string) => {
    const base = slugify(inner) || "section";
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
}

async function readPosts(): Promise<Post[]> {
  let entries: string[];
  try {
    entries = await readdir(POSTS_DIR);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".md")).sort();

  const posts: Post[] = [];
  for (const file of files) {
    const raw = await readFile(join(POSTS_DIR, file), "utf8");
    const { data, body } = splitFrontmatter(raw, file);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new BuildError(`${file}: frontmatter must be a YAML mapping`);
    }
    const fm = data as Record<string, unknown>;
    if (fm.draft === true) continue;

    const dateRaw = requireString(fm, "date", file);
    const tags = fm.tags === undefined ? [] : fm.tags;
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
      throw new BuildError(`${file}: frontmatter "tags" must be a list of strings`);
    }

    posts.push({
      // Filenames carry a date and an optional sequence number for ordering.
      // Neither is part of the URL: 2026-07-25-1-lockfiles.md -> /blog/lockfiles/
      slug:
        typeof fm.slug === "string" && fm.slug
          ? fm.slug
          : file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-(\d+-)?/, ""),
      title: requireString(fm, "title", file),
      description: requireString(fm, "description", file),
      date: parseDate(dateRaw, file),
      dateRaw,
      tags: tags as string[],
      html: addHeadingIds(marked.parse(body, { async: false })),
      file,
    });
  }

  const bySlug = new Map<string, string>();
  for (const p of posts) {
    const prev = bySlug.get(p.slug);
    if (prev) throw new BuildError(`duplicate post slug "${p.slug}" (${prev} and ${p.file})`);
    bySlug.set(p.slug, p.file);
  }

  // Newest first. Same-day posts fall back to filename, so the sequence number
  // in the filename decides the running order (lower number = higher on the page).
  posts.sort((a, b) => b.date.getTime() - a.date.getTime() || a.file.localeCompare(b.file));
  return posts;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function displayDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function nav(root: string, current: "blog" | "post"): string {
  return `<nav>
  <div class="nav-in">
    <a class="brand" href="${root}"><span class="prompt">&gt;_</span> <b>skillfold</b></a>
    <div class="nav-links">
      <a href="${root}#features"><i>01</i> Features</a>
      <a href="${root}#manifest"><i>02</i> Manifest</a>
      <a href="${root}#commands"><i>03</i> Commands</a>
      <a href="${root}#install"><i>04</i> Install</a>
      <a class="keep" href="${current === "blog" ? "" : "../"}">Blog</a>
      <a class="gh" href="https://github.com/byronxlg/skillfold" target="_blank" rel="noopener">GitHub &#8599;</a>
    </div>
  </div>
</nav>`;
}

function footer(root: string): string {
  return `<footer>
  <div class="foot-in">
    <div class="brand"><span class="prompt">&gt;_</span> <b>skillfold</b> &nbsp;<span style="color:var(--faint)">TypeScript + Node</span></div>
    <div class="foot-links">
      <a href="https://github.com/byronxlg/skillfold" target="_blank" rel="noopener">GitHub</a>
      <a href="https://www.npmjs.com/package/skillfold" target="_blank" rel="noopener">npm</a>
      <a href="${root}#install">Install</a>
      <a href="${root}feed.xml">RSS</a>
    </div>
  </div>
  <div class="manline">
    <span>skillfold(1)</span>
    <span class="mid">user commands</span>
    <span>skillfold(1)</span>
  </div>
</footer>`;
}

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='14' fill='%230a0e14'/%3E%3Ctext x='50' y='72' font-size='64' text-anchor='middle' fill='%234d8bf5' font-family='monospace'%3E%3E_%3C/text%3E%3C/svg%3E";

function page(opts: {
  root: string;
  title: string;
  description: string;
  canonical: string;
  body: string;
  current: "blog" | "post";
}): string {
  const t = escapeHtml(opts.title);
  const d = escapeHtml(opts.description);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${escapeHtml(opts.canonical)}" />
<meta property="og:type" content="${opts.current === "post" ? "article" : "website"}" />
<meta property="og:url" content="${escapeHtml(opts.canonical)}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta name="twitter:card" content="summary" />
<link rel="icon" href="${FAVICON}" />
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(BLOG_TITLE)}" href="${opts.root}feed.xml" />
<link rel="stylesheet" href="${opts.root}assets/base.css" />
<link rel="stylesheet" href="${opts.root}assets/blog.css" />
</head>
<body>

${nav(opts.root, opts.current)}

<div class="rail">
${opts.body}
</div><!-- /rail -->

${footer(opts.root)}
</body>
</html>
`;
}

function postMetaLine(p: Post): string {
  const tags = p.tags.map((t) => `<span class="d">/</span> <span class="tag">${escapeHtml(t)}</span>`).join(" ");
  return `<time datetime="${p.dateRaw}">${displayDate(p.date)}</time> ${tags}`;
}

function renderIndex(posts: Post[]): string {
  const rows = posts
    .map(
      (p) => `    <a class="post-row" href="${p.slug}/">
      <p class="post-meta">${postMetaLine(p)}</p>
      <h2 class="post-title">${escapeHtml(p.title)}</h2>
      <p class="post-dek">${escapeHtml(p.description)}</p>
      <span class="post-more">Read &#8594;</span>
    </a>`,
    )
    .join("\n");

  const list = posts.length
    ? `  <div class="posts">\n${rows}\n  </div>`
    : `  <p class="empty">No posts yet.</p>`;

  return `<section id="posts">
  <div class="sec-head">
    <span class="sec-label"><i>&#9679;</i>Blog</span>
    <h2>Notes from the lockfile</h2>
    <p class="lead">${escapeHtml(BLOG_DESC)}
      Subscribe via <a class="alink" href="../feed.xml">RSS</a>.</p>
  </div>
${list}
</section>`;
}

function renderPost(p: Post, newer: Post | undefined, older: Post | undefined): string {
  const prev = newer ? `<a href="../${newer.slug}/">&#8592; ${escapeHtml(newer.title)}</a>` : `<span></span>`;
  const next = older ? `<a href="../${older.slug}/">${escapeHtml(older.title)} &#8594;</a>` : `<span></span>`;
  return `<section class="article">
  <div class="article-head">
    <p class="post-meta">${postMetaLine(p)}</p>
    <h1 class="post-h1">${escapeHtml(p.title)}</h1>
    <p class="article-dek">${escapeHtml(p.description)}</p>
  </div>
  <article class="prose">
${p.html.trimEnd()}
  </article>
  <nav class="article-nav">
    ${prev}
    ${next}
  </nav>
</section>`;
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

function renderFeed(posts: Post[], buildDate: Date): string {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${SITE_URL}blog/${p.slug}/</link>
      <guid isPermaLink="true">${SITE_URL}blog/${p.slug}/</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${escapeHtml(p.description)}</description>
      <content:encoded><![CDATA[${p.html.replace(/]]>/g, "]]&gt;")}]]></content:encoded>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeHtml(BLOG_TITLE)}</title>
    <link>${SITE_URL}blog/</link>
    <description>${escapeHtml(BLOG_DESC)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(buildDate)}</lastBuildDate>
    <atom:link href="${SITE_URL}feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function renderSitemap(posts: Post[]): string {
  const urls = [
    `  <url>\n    <loc>${SITE_URL}</loc>\n  </url>`,
    `  <url>\n    <loc>${SITE_URL}blog/</loc>${posts[0] ? `\n    <lastmod>${isoDate(posts[0].date)}</lastmod>` : ""}\n  </url>`,
    ...posts.map(
      (p) => `  <url>\n    <loc>${SITE_URL}blog/${p.slug}/</loc>\n    <lastmod>${isoDate(p.date)}</lastmod>\n  </url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function renderRobots(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;
}

const LANDING_START = "<!-- skillfold:blog:start -->";
const LANDING_END = "<!-- skillfold:blog:end -->";
const LANDING_COUNT = 3;

/**
 * Fill the marker-fenced block on the landing page with the newest posts.
 * The block is committed, so this only rewrites index.html when the rendered
 * rows actually change - a clean tree stays clean.
 */
async function syncLandingPage(posts: Post[]): Promise<boolean> {
  const file = join(SITE, "index.html");
  const html = await readFile(file, "utf8");
  const start = html.indexOf(LANDING_START);
  const end = html.indexOf(LANDING_END);
  if (start === -1 || end === -1) {
    throw new BuildError(`site/index.html is missing the ${LANDING_START} / ${LANDING_END} markers`);
  }
  if (end < start) throw new BuildError("site/index.html has the blog markers in the wrong order");

  const rows = posts
    .slice(0, LANDING_COUNT)
    .map(
      (p) => `    <a class="keyrow" href="blog/${p.slug}/">
      <span class="cmd-name">${escapeHtml(p.title)}</span>
      <span class="dots"></span>
      <span class="act">${displayDate(p.date)}</span>
    </a>`,
    )
    .join("\n");

  const block = `${LANDING_START}\n  <div class="posts-mini">\n${rows}\n  </div>\n  ${LANDING_END}`;
  const next = html.slice(0, start) + block + html.slice(end + LANDING_END.length);
  if (next === html) return false;
  await writeFile(file, next);
  return true;
}

async function main(): Promise<void> {
  const posts = await readPosts();

  // Clear previously generated post directories; posts/ holds the sources.
  for (const entry of await readdir(BLOG_DIR, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && entry.name !== "posts") {
      await rm(join(BLOG_DIR, entry.name), { recursive: true, force: true });
    }
  }

  await mkdir(BLOG_DIR, { recursive: true });
  await writeFile(
    join(BLOG_DIR, "index.html"),
    page({
      root: "../",
      title: `${BLOG_TITLE} - declare, pin, install`,
      description: BLOG_DESC,
      canonical: `${SITE_URL}blog/`,
      body: renderIndex(posts),
      current: "blog",
    }),
  );

  for (const [i, p] of posts.entries()) {
    await mkdir(join(BLOG_DIR, p.slug), { recursive: true });
    await writeFile(
      join(BLOG_DIR, p.slug, "index.html"),
      page({
        root: "../../",
        title: `${p.title} - skillfold`,
        description: p.description,
        canonical: `${SITE_URL}blog/${p.slug}/`,
        body: renderPost(p, posts[i - 1], posts[i + 1]),
        current: "post",
      }),
    );
  }

  const newest = posts[0]?.date ?? new Date(0);
  await writeFile(join(SITE, "feed.xml"), renderFeed(posts, newest));
  await writeFile(join(SITE, "sitemap.xml"), renderSitemap(posts));
  await writeFile(join(SITE, "robots.txt"), renderRobots());
  const landingChanged = await syncLandingPage(posts);

  console.log(
    `blog: ${posts.length} post${posts.length === 1 ? "" : "s"} -> site/blog/, feed.xml, sitemap.xml, robots.txt` +
      (landingChanged ? "\nblog: rewrote the landing page block (commit site/index.html)" : ""),
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof BuildError ? err.message : err instanceof Error ? err.stack : String(err);
  console.error(`build-blog failed: ${msg}`);
  process.exit(1);
});
