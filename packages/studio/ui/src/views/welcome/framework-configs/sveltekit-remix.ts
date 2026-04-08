/**
 * SvelteKit and Remix setup walkthroughs.
 *
 * Both are Vite-based meta-frameworks with separate server hooks, so they
 * are grouped here.
 */

import { Cable, Server } from "lucide-react";

import type { FrameworkConfig } from "../frameworks-types";
import { EXPLORE_STEP, VERIFY_STEP, installStep } from "./shared";

export const SVELTEKIT: FrameworkConfig = {
  id: "sveltekit",
  name: "SvelteKit",
  description: "Svelte meta-framework with SSR",
  steps: [
    installStep("@noverax/nexus-studio @noverax/nexus-studio-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "SvelteKit uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { sveltekit } from "@sveltejs/kit/vite";
import { nexusStudio } from "@noverax/nexus-studio/sveltekit";

export default defineConfig({
  plugins: [sveltekit(), nexusStudio()],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks proxy-mode requests in SvelteKit's server hooks.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "src/hooks.server.ts",
      lang: "ts",
      code: `import { instrumentServer } from "@noverax/nexus-studio-core";
import { sources } from "$lib/api";
import { dev } from "$app/environment";

if (dev) {
  instrumentServer({ sources });
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

export const REMIX: FrameworkConfig = {
  id: "remix",
  name: "Remix",
  description: "React framework with Vite",
  steps: [
    installStep("@noverax/nexus-studio @noverax/nexus-studio-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "Remix uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { vitePlugin as remix } from "@remix-run/dev";
import { nexusStudio } from "@noverax/nexus-studio/remix";

export default defineConfig({
  plugins: [remix(), nexusStudio()],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks proxy-mode requests in Remix's server entry.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "app/entry.server.tsx",
      lang: "ts",
      code: `import { instrumentServer } from "@noverax/nexus-studio-core";
import { sources } from "~/api";

if (process.env.NODE_ENV === "development") {
  instrumentServer({ sources });
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
