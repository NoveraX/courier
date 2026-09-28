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
    installStep({ withRuntime: true }),
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
      description:
        "Tracks proxy-mode requests in Astro's server middleware. Astro requires the file to export onRequest.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "src/middleware.ts",
      lang: "ts",
      code: `import { defineMiddleware } from "astro:middleware";
import { attachRuntime } from "@noverax/courier-studio-core/runtime";

if (import.meta.env.DEV) {
  await attachRuntime();
}

export const onRequest = defineMiddleware((_context, next) => next());`,
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
    installStep(),
    {
      id: "instrument",
      title: "Initialize Studio",
      description:
        "Call it before bootstrapping your app. For a non-default Studio address, pass { studioUrl }.",
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
    installStep({ withRuntime: true }),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "Solid Start runs on Vite — the plugin connects the browser in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { solidStart } from "@solidjs/start/config";
import { courierStudio } from "@noverax/courier-studio/solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solidStart(), courierStudio()],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks proxy-mode requests on the Solid Start server. Add it to the top of the file.",
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
