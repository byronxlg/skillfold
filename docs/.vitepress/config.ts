import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Skillfold",
  description: "One config for every AI coding agent",

  // GitHub Pages: https://byronxlg.github.io/skillfold/
  base: "/skillfold/",

  head: [
    [
      "link",
      { rel: "icon", type: "image/svg+xml", href: "/skillfold/favicon.svg" },
    ],
    ["meta", { property: "og:title", content: "Skillfold" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "One config for every AI coding agent. Compile YAML pipelines to 12 platforms.",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    [
      "meta",
      {
        property: "og:url",
        content: "https://byronxlg.github.io/skillfold/",
      },
    ],
    [
      "meta",
      {
        property: "og:image",
        content: "https://byronxlg.github.io/skillfold/og-image.svg",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "Skillfold" }],
    [
      "meta",
      {
        name: "twitter:description",
        content:
          "One config for every AI coding agent. Compile YAML pipelines to 12 platforms.",
      },
    ],
    [
      "meta",
      {
        name: "twitter:image",
        content: "https://byronxlg.github.io/skillfold/og-image.svg",
      },
    ],
  ],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Reference", link: "/reference/config" },
      { text: "Builder", link: "/builder" },
      { text: "Demo", link: "/demo" },
      { text: "Blog", link: "/blog/" },
      { text: "GitHub", link: "https://github.com/byronxlg/skillfold" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Library Skills", link: "/library" },
          { text: "Live Demo", link: "/demo" },
          { text: "Pipeline Builder", link: "/builder" },
          { text: "Examples", link: "/examples" },
          { text: "Running Pipelines", link: "/running-pipelines" },
          { text: "Agent Teams Bridge", link: "/agent-teams-bridge" },
          { text: "Agent Teams Tutorial", link: "/agent-teams-tutorial" },
          { text: "Platform Integration", link: "/integrations" },
          { text: "Publishing Skills", link: "/publishing" },
          { text: "Authoring Skills", link: "/authoring" },
          { text: "Comparisons", link: "/comparisons" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Config Format", link: "/reference/config" },
          { text: "CLI", link: "/reference/cli" },
          { text: "Changelog", link: "/changelog" },
        ],
      },
      {
        text: "Blog",
        items: [
          { text: "All Posts", link: "/blog/" },
          {
            text: "My Dev Team Is a YAML File",
            link: "/blog/self-hosting-pipeline",
          },
        ],
      },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/byronxlg/skillfold" },
      {
        icon: { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" fill="currentColor"/></svg>' },
        link: "https://www.npmjs.com/package/skillfold",
        ariaLabel: "npm",
      },
    ],

    editLink: {
      pattern:
        "https://github.com/byronxlg/skillfold/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright 2024-present Skillfold Contributors",
    },
  },

  srcExclude: [
    "submissions/**",
    "community-post.md",
    "awesome-claude-code-submission.md",
  ],
});
