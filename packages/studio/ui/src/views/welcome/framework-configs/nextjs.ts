/**
 * Next.js (App Router) setup walkthrough.
 *
 * Covers both Turbopack (v15.3+) and Webpack/v14 instrumentation paths.
 */

import { Cable, Server } from "lucide-react";

import type { FrameworkConfig } from "../frameworks-types";
import { EXPLORE_STEP, VERIFY_STEP, installStep } from "./shared";

export const NEXTJS: FrameworkConfig = {
  id: "nextjs",
  name: "Next.js",
  description: "App Router v14+ (Turbopack & Webpack)",
  steps: [
    installStep("@noverax/nexus-studio @noverax/nexus-studio-core"),
    {
      id: "instrument-client",
      title: "Add client instrumentation",
      description: "Turbopack (v15.3+): convention file. Webpack / Next.js 14: config wrapper. Both connect the browser to Studio.",
      icon: Cable,
      actionLabel: "Copy snippet",
      variants: [
        {
          label: "Turbopack (v15.3+)",
          filePath: "instrumentation-client.ts",
          code: `import { attachRuntime } from "@noverax/nexus-studio-core/runtime";

if (process.env.NODE_ENV === "development") {
  attachRuntime("next-browser");
}`,
        },
        {
          label: "Webpack / v14",
          filePath: "next.config.ts",
          code: `import { withNexusStudio } from "@noverax/nexus-studio/next";

const nextConfig = {
  // Next.js 14 only — remove for v15+
  experimental: { instrumentationHook: true },
};

export default withNexusStudio()(nextConfig);`,
        },
      ],
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks server-side requests. Runs once on server startup in the Node.js runtime. Auto-loads sources from nexus.config.ts.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "instrumentation.ts",
      lang: "ts",
      code: `export async function register() {
  // Only instrument in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { attachRuntime } = await import("@noverax/nexus-studio-core/runtime");
    await attachRuntime();
  }
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
