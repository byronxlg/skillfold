---
layout: page
title: Pipeline Builder
---

# Pipeline Builder

Edit YAML on the left, see the Mermaid flow graph update live on the right. Use this to prototype pipeline configs before adding them to your project.

<script setup>
import PipelineBuilder from './.vitepress/components/PipelineBuilder.vue'
</script>

<ClientOnly>
  <PipelineBuilder />
</ClientOnly>
