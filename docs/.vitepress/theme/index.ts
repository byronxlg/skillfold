import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "./styles.css";
import HomeLayout from "./HomeLayout.vue";

export default {
  extends: DefaultTheme,
  Layout: HomeLayout,
} satisfies Theme;
