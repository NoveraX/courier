/**
 * Astro, Angular, and Solid Start setup walkthroughs.
 *
 * Grouped together because none have unique build pipelines large enough
 * to justify their own file.
 */

import { Cable, Server } from "lucide-react";

import type { FrameworkConfig } from "../frameworks-types";
import { EXPLORE_STEP, VERIFY_STEP, installStep } from "./shared";

export const ASTRO: FrameworkConfig = {
  id: "astro",
  name: "Astro",
  description: "Content-driven framework with SSR",
  steps: [
    installStep("@noverax/courier-studio @noverax/courier-studio-core"),
    {
      id: "instrument-client",
      title: "Add Astro integration",
      description: "Auto-injects client connection on every page in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "astro.config.mjs",
      lang: "ts",
      code: `import { defineConfig } from "astro/config";
import { courierStudio } from "@noverax/courier-studio/astro";

export default defineConfig({
  integrations: [courierStudio()],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks proxy-mode requests in Astro's server middleware.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "src/middleware.ts",
      lang: "ts",
      code: `import { attachRuntime } from "@noverax/courier-studio-core/runtime";

if (import.meta.env.DEV) {
  await attachRuntime();
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

export const ANGULAR: FrameworkConfig = {
  id: "angular",
  name: "Angular",
  description: "Full-featured platform by Google",
  steps: [
    installStep("@noverax/courier-studio"),
    {
      id: "instrument",
      title: "Initialize Studio",
      description: "Call the setup function before bootstrapping your app.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "src/main.ts",
      lang: "ts",
      code: `import { setupCourierStudio } from "@noverax/courier-studio/angular";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

setupCourierStudio();

bootstrapApplication(AppComponent, appConfig);`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

export const SOLID: FrameworkConfig = {
  id: "solid",
  name: "Solid Start",
  description: "Solid.js meta-framework",
  steps: [
    installStep("@noverax/courier-studio @noverax/courier-studio-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "Solid Start uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "app.config.ts",
      lang: "ts",
      code: `import { defineConfig } from "@solidjs/start/config";
import { courierStudio } from "@noverax/courier-studio/solid";

export default defineConfig({
  vite: { plugins: [courierStudio()] },
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks proxy-mode requests on the Solid Start server.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "src/entry-server.tsx",
      lang: "ts",
      code: `import { attachRuntime } from "@noverax/courier-studio-core/runtime";

if (import.meta.env.DEV) {
  await attachRuntime();
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};
