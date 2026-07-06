import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Test-only helpers (excluded from the published build). */

export interface TmpDir {
  path: string;
  cleanup: () => void;
}

export function makeTmpDir(): TmpDir {
  const path = mkdtempSync(join(tmpdir(), "skillfold-test-"));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

export function writeFile(root: string, relPath: string, content: string): void {
  const target = join(root, ...relPath.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export function writeSkill(
  root: string,
  relDir: string,
  name: string,
  body = `# ${name}\n\nDo the thing.`
): void {
  writeFile(
    root,
    `${relDir}/SKILL.md`,
    `---\nname: ${name}\ndescription: Test skill ${name}.\n---\n\n${body}\n`
  );
}

/** A fetch stub driven by a URL -> response map. Records every request. */
export function makeFetcher(
  routes: Record<string, unknown | ((url: string) => unknown)>
): { fetcher: typeof fetch; requests: string[] } {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    for (const [prefix, value] of Object.entries(routes)) {
      if (url === prefix || url.startsWith(prefix)) {
        const body = typeof value === "function" ? (value as (u: string) => unknown)(url) : value;
        if (body === null) {
          return new Response("not found", { status: 404 });
        }
        if (typeof body === "string") {
          return new Response(body, { status: 200 });
        }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("unrouted: " + url, { status: 500 });
  }) as typeof fetch;
  return { fetcher, requests };
}
