/**
 * Next.js (App Router) setup walkthrough.
 *
 * Covers both Turbopack (the default since Next.js 16) and webpack.
 */

import { Cable, Server } from "lucide-react";

import type { FrameworkConfig } from "../frameworks-types";
import { EXPLORE_STEP, VERIFY_STEP, installStep } from "./shared";

export const NEXTJS: FrameworkConfig = {
  id: "nextjs",
  name: "Next.js",
  description: "App Router v14+ (Turbopack & webpack)",
  steps: [
    installStep("@noverax/courier-studio @noverax/courier-studio-core"),
    {
      id: "instrument-client",
      title: "Add client instrumentation",
      description:
        "Turbopack, the default since Next.js 16, runs no webpack plugins: connect the browser from instrumentation-client.ts (Next.js 15.3+). Under webpack the config wrapper does it for you. For a non-default Studio address, add env: { COURIER_STUDIO_URL } to next.config.",
      icon: Cable,
      actionLabel: "Copy snippet",
      variants: [
        {
          label: "Turbopack",
          filePath: "instrumentation-client.ts",
          code: `import { attachRuntime } from "@noverax/courier-studio-core/runtime";

if (process.env.NODE_ENV === "development") {
  attachRuntime("next-browser");
}`,
        },
        {
          label: "Webpack",
          filePath: "next.config.ts",
          code: `import { withCourierStudio } from "@noverax/courier-studio/next";

const nextConfig = {
  // Next.js 14 only — remove for v15+
  experimental: { instrumentationHook: true },
};

export default withCourierStudio()(nextConfig);`,
        },
      ],
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks server-side requests. Runs once on server startup in the Node.js runtime. Auto-loads sources from courier.config.ts.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "instrumentation.ts",
      lang: "ts",
      code: `export async function register() {
  // Only instrument in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
    await attachRuntime();
  }
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
