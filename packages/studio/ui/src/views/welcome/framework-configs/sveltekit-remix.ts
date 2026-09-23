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
    installStep("@noverax/courier-studio @noverax/courier-studio-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "SvelteKit uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { sveltekit } from "@sveltejs/kit/vite";
import { courierStudio } from "@noverax/courier-studio/sveltekit";

export default defineConfig({
  plugins: [sveltekit(), courierStudio()],
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
      code: `import { attachRuntime } from "@noverax/courier-studio-core/runtime";
import { dev } from "$app/environment";

if (dev) {
  await attachRuntime();
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

export const REMIX: FrameworkConfig = {
  id: "remix",
  name: "Remix",
  description: "React Router (Remix) with Vite",
  steps: [
    installStep("@noverax/courier-studio @noverax/courier-studio-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "Remix uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { vitePlugin as remix } from "@remix-run/dev";
import { courierStudio } from "@noverax/courier-studio/remix";

export default defineConfig({
  plugins: [remix(), courierStudio()],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description:
        "Tracks proxy-mode requests in the server entry. Add it to the top of the file — on React Router 7, create it first with npx react-router reveal entry.server.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "app/entry.server.tsx",
      lang: "ts",
      code: `import { attachRuntime } from "@noverax/courier-studio-core/runtime";

if (process.env.NODE_ENV === "development") {
  await attachRuntime();
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
