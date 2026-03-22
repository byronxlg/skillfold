# Blog

<script setup>
import { withBase } from 'vitepress'
</script>

Posts about building and using multi-agent pipelines with Skillfold.

---

<div class="blog-list">

<a class="blog-card" :href="withBase('/blog/twelve-platforms')">
  <div class="blog-meta">March 21, 2026</div>
  <h2>One Config, Twelve Platforms</h2>
  <p>How skillfold compiles the same YAML config to Claude Code, Cursor, Windsurf, Copilot, Codex, Gemini, Goose, Roo Code, Kiro, Junie, Agent Teams, and standard SKILL.md files. The story of format fragmentation and why a compiler fixes it.</p>
  <span class="blog-read-more">Read more &#8594;</span>
</a>

<a class="blog-card" :href="withBase('/blog/self-hosting-pipeline')">
  <div class="blog-meta">March 15, 2025</div>
  <h2>My Dev Team Is a YAML File</h2>
  <p>How skillfold manages its own development with a multi-agent pipeline defined in 128 lines of YAML. Seven AI agents coordinate through a config that the compiler reads, validates, and compiles into the skill files those same agents use.</p>
  <span class="blog-read-more">Read more &#8594;</span>
</a>

</div>
