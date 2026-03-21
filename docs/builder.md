---
layout: page
title: Pipeline Builder
---

# Pipeline Builder

Prototype pipeline configs interactively. Edit YAML on the left and the flow graph updates live on the right. Click any node to see its composition details.

::: tip Start from an example
Use the dropdown to load one of the three built-in templates, then modify it to fit your use case.
:::

<script setup>
import PipelineBuilder from './.vitepress/components/PipelineBuilder.vue'
</script>

<ClientOnly>
  <PipelineBuilder />
</ClientOnly>

## Next steps

Once your config looks right:

1. **Save it** - Copy the YAML into a `skillfold.yaml` file in your project root
2. **Install** - Run `npm install skillfold` (or use `npx` directly)
3. **Compile** - Run `npx skillfold --target claude-code` (or any of the [12 supported targets](/integrations))
4. **Run** - Optionally execute the pipeline with `npx skillfold run --target claude-code`

See the [Getting Started](/getting-started) guide for a full walkthrough, or browse the [Examples](/examples) for more pipeline patterns.
