import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Skillfold",
  description: "Typed coordination for multi-agent pipelines",

  // GitHub Pages: https://byronxlg.github.io/skillfold/
  base: "/skillfold/",

  themeConfig: {
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Reference", link: "/reference/config" },
      { text: "GitHub", link: "https://github.com/byronxlg/skillfold" },
      { text: "npm", link: "https://www.npmjs.com/package/skillfold" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Platform Integration", link: "/integrations" },
          { text: "Publishing Skills", link: "/publishing" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Config Format", link: "/reference/config" },
          { text: "CLI", link: "/reference/cli" },
        ],
      },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/byronxlg/skillfold" },
    ],

    editLink: {
      pattern:
        "https://github.com/byronxlg/skillfold/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
    },
  },

  srcExclude: [
    "submissions/**",
    "community-post.md",
    "awesome-claude-code-submission.md",
  ],
});
