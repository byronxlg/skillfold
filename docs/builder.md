---
layout: page
title: Pipeline Builder
---

<div class="page-hero">
  <h1>Pipeline Builder</h1>
  <p>Prototype pipeline configs interactively. Edit YAML on the left, see the flow graph update live on the right.</p>
  <div class="stat-pills">
    <span class="stat-pill">Click nodes for details</span>
    <span class="stat-pill">Load examples from dropdown</span>
    <span class="stat-pill">Export SVG or copy YAML</span>
  </div>
</div>

<script setup>
import PipelineBuilder from './.vitepress/components/PipelineBuilder.vue'
</script>

<ClientOnly>
  <PipelineBuilder />
</ClientOnly>

<div style="max-width: 720px; margin: 32px auto 0; padding: 0 24px;">

## From prototype to pipeline

Once your config looks right:

1. **Copy** the YAML into a `skillfold.yaml` file in your project
2. **Compile** with `npx skillfold --target claude-code` (or any of the [12 targets](/integrations))
3. **Run** with `npx skillfold run --target claude-code` to execute the pipeline

<div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px;">
  <a href="/skillfold/getting-started" style="font-weight: 500; color: var(--vp-c-brand-1);">Getting Started guide &#8594;</a>
  <a href="/skillfold/examples" style="font-weight: 500; color: var(--vp-c-brand-1);">Example pipelines &#8594;</a>
</div>

</div>
