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
    installStep({ withRuntime: true }),
    {
      id: "instrument-client",
      title: "Add Nuxt module",
      description: "Registers Studio and auto-injects the client connection.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "nuxt.config.ts",
      lang: "ts",
      code: `import { courierStudioModule } from "@noverax/courier-studio/nuxt";

export default defineNuxtConfig({
  modules: [courierStudioModule],
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
      code: `export default defineNitroPlugin(async () => {
  if (import.meta.dev) {
    const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
    await attachRuntime();
  }
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
