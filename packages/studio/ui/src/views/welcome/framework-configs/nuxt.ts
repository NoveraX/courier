/**
 * Nuxt setup walkthrough.
 *
 * Uses the Nuxt module for client and a Nitro plugin for server tracking.
 */

import { Cable, Server } from "lucide-react";

import type { FrameworkConfig } from "../frameworks-types";
import { EXPLORE_STEP, VERIFY_STEP, installStep } from "./shared";

export const NUXT: FrameworkConfig = {
  id: "nuxt",
  name: "Nuxt",
  description: "Vue meta-framework with SSR",
  steps: [
    installStep("@noverax/nexus-studio @noverax/nexus-studio-core"),
    {
      id: "instrument-client",
      title: "Add Nuxt module",
      description: "Registers Studio and auto-injects the client connection.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "nuxt.config.ts",
      lang: "ts",
      code: `import { nexusStudioModule } from "@noverax/nexus-studio/nuxt";

export default defineNuxtConfig({
  modules: [nexusStudioModule],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Create a Nitro plugin to track proxy-mode requests on the server.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "server/plugins/studio.ts",
      lang: "ts",
      code: `import { attachRuntime } from "@noverax/nexus-studio-core/runtime";

export default defineNitroPlugin(async () => {
  if (import.meta.dev) {
    await attachRuntime();
  }
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
