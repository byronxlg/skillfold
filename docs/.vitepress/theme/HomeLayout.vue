<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useRoute } from "vitepress";

const { Layout } = DefaultTheme;
const route = useRoute();
</script>

<template>
  <Layout>
    <template #layout-top>
      <div v-if="route.path === '/' || route.path === '/skillfold/'" class="announcement-bar">
        <a href="/skillfold/changelog">
          <span class="announcement-badge">New</span>
          <span class="announcement-text">v1.23 - Now compiles to 12 platforms: Goose, Roo Code, Kiro, and Junie added</span>
          <span class="announcement-arrow">&rarr;</span>
        </a>
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.announcement-bar {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.08));
  border-bottom: 1px solid rgba(16, 185, 129, 0.15);
  padding: 8px 16px;
  text-align: center;
  font-size: 13px;
  z-index: 30;
}

.dark .announcement-bar {
  background: linear-gradient(90deg, rgba(52, 211, 153, 0.06), rgba(34, 211, 238, 0.06));
  border-bottom-color: rgba(52, 211, 153, 0.1);
}

.announcement-bar a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: opacity 0.2s;
}

.announcement-bar a:hover {
  opacity: 0.8;
}

.announcement-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 10px;
  background: linear-gradient(135deg, #10b981, #06b6d4);
  color: white;
}

.dark .announcement-badge {
  background: linear-gradient(135deg, #34d399, #22d3ee);
  color: #0f172a;
}

.announcement-text {
  color: var(--vp-c-text-2);
}

.announcement-arrow {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}
</style>
