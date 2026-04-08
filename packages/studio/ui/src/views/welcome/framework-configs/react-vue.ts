/**
 * React (Vite) and Vue (Vite) setup walkthroughs.
 *
 * Both share the same minimal Vite plugin pattern, so they live together.
 */

import { Cable } from "lucide-react";

import type { FrameworkConfig } from "../frameworks-types";
import { EXPLORE_STEP, VERIFY_STEP, installStep } from "./shared";

export const REACT: FrameworkConfig = {
  id: "react",
  name: "React",
  description: "React with Vite",
  steps: [
    installStep("@noverax/nexus-studio"),
    {
      id: "instrument",
      title: "Add Vite plugin",
      description: "Register the Studio plugin in your Vite config.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import react from "@vitejs/plugin-react";
import { nexusStudio } from "@noverax/nexus-studio/react";

export default defineConfig({
  plugins: [react(), nexusStudio()],
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

export const VUE: FrameworkConfig = {
  id: "vue",
  name: "Vue",
  description: "Vue with Vite",
  steps: [
    installStep("@noverax/nexus-studio"),
    {
      id: "instrument",
      title: "Add Vite plugin",
      description: "Register the Studio plugin in your Vite config.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import vue from "@vitejs/plugin-vue";
import { nexusStudio } from "@noverax/nexus-studio/vue";

export default defineConfig({
  plugins: [vue(), nexusStudio()],
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
