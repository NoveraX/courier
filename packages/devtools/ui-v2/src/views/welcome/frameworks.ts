import type { LucideIcon } from "lucide-react";
import { Package, Cable, Server, Zap, Compass } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CodeVariant {
  label: string;
  filePath: string;
  code: string;
  lang?: string;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel: string;
  filePath?: string;
  code?: string;
  lang?: string;
  /** Multiple code variants with tab switcher (e.g. Turbopack vs Webpack) */
  variants?: CodeVariant[];
  autoComplete?: boolean;
}

export interface FrameworkConfig {
  id: string;
  name: string;
  description: string;
  steps: SetupStep[];
}

// ── Shared steps ────────────────────────────────────────────────────────────

const VERIFY_STEP: SetupStep = {
  id: "connect",
  title: "Verify connection",
  description: "Start your dev server — this step completes automatically when a session connects.",
  icon: Zap,
  actionLabel: "Waiting for connection…",
  autoComplete: true,
};

const EXPLORE_STEP: SetupStep = {
  id: "explore",
  title: "Start exploring",
  description: "You're all set! Dive into Timeline, Playground, Audit and more.",
  icon: Compass,
  actionLabel: "Go to Timeline",
};

function installStep(pkg: string): SetupStep {
  return {
    id: "install",
    title: "Install packages",
    description: "Add the DevTools package to your project.",
    icon: Package,
    actionLabel: "Copy command",
    code: `npm install -D ${pkg}`,
    lang: "bash",
  };
}

// ── Next.js ─────────────────────────────────────────────────────────────────

const NEXTJS: FrameworkConfig = {
  id: "nextjs",
  name: "Next.js",
  description: "App Router v14+ (Turbopack & Webpack)",
  steps: [
    installStep("@noverax/nexus-devtools @noverax/nexus-devtools-core"),
    {
      id: "instrument-client",
      title: "Add client instrumentation",
      description: "Turbopack (v15.3+): convention file. Webpack / Next.js 14: config wrapper. Both connect the browser to DevTools.",
      icon: Cable,
      actionLabel: "Copy snippet",
      variants: [
        {
          label: "Turbopack (v15.3+)",
          filePath: "instrumentation-client.ts",
          code: `import { connectDevTools } from "@noverax/nexus-devtools-core";

if (process.env.NODE_ENV === "development") {
  connectDevTools();
}`,
        },
        {
          label: "Webpack / v14",
          filePath: "next.config.ts",
          code: `import { withNexusDevTools } from "@noverax/nexus-devtools/next";

const nextConfig = {
  // Next.js 14 only — remove for v15+
  experimental: { instrumentationHook: true },
};

export default withNexusDevTools()(nextConfig);`,
        },
      ],
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Tracks server-side requests. Runs once on server startup in the Node.js runtime.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "instrumentation.ts",
      lang: "ts",
      code: `export async function register() {
  // Only instrument in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { instrumentServer } = await import("@noverax/nexus-devtools-core");
    const { sources } = await import("@/api");
    instrumentServer({ sources });
  }
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── Nuxt ────────────────────────────────────────────────────────────────────

const NUXT: FrameworkConfig = {
  id: "nuxt",
  name: "Nuxt",
  description: "Vue meta-framework with SSR",
  steps: [
    installStep("@noverax/nexus-devtools @noverax/nexus-devtools-core"),
    {
      id: "instrument-client",
      title: "Add Nuxt module",
      description: "Registers DevTools and auto-injects the client connection.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "nuxt.config.ts",
      lang: "ts",
      code: `import { nexusDevToolsModule } from "@noverax/nexus-devtools/nuxt";

export default defineNuxtConfig({
  modules: [nexusDevToolsModule],
});`,
    },
    {
      id: "instrument-server",
      title: "Add server instrumentation",
      description: "Create a Nitro plugin to track proxy-mode requests on the server.",
      icon: Server,
      actionLabel: "Copy snippet",
      filePath: "server/plugins/devtools.ts",
      lang: "ts",
      code: `import { instrumentServer } from "@noverax/nexus-devtools-core";
import { sources } from "~/api";

export default defineNitroPlugin(() => {
  if (import.meta.dev) {
    instrumentServer({ sources });
  }
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── React (Vite) ────────────────────────────────────────────────────────────

const REACT: FrameworkConfig = {
  id: "react",
  name: "React",
  description: "React with Vite",
  steps: [
    installStep("@noverax/nexus-devtools"),
    {
      id: "instrument",
      title: "Add Vite plugin",
      description: "Register the DevTools plugin in your Vite config.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import react from "@vitejs/plugin-react";
import { nexusDevTools } from "@noverax/nexus-devtools/react";

export default defineConfig({
  plugins: [react(), nexusDevTools()],
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── Vue (Vite) ──────────────────────────────────────────────────────────────

const VUE: FrameworkConfig = {
  id: "vue",
  name: "Vue",
  description: "Vue with Vite",
  steps: [
    installStep("@noverax/nexus-devtools"),
    {
      id: "instrument",
      title: "Add Vite plugin",
      description: "Register the DevTools plugin in your Vite config.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import vue from "@vitejs/plugin-vue";
import { nexusDevTools } from "@noverax/nexus-devtools/vue";

export default defineConfig({
  plugins: [vue(), nexusDevTools()],
});`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── SvelteKit ───────────────────────────────────────────────────────────────

const SVELTEKIT: FrameworkConfig = {
  id: "sveltekit",
  name: "SvelteKit",
  description: "Svelte meta-framework with SSR",
  steps: [
    installStep("@noverax/nexus-devtools @noverax/nexus-devtools-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "SvelteKit uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { sveltekit } from "@sveltejs/kit/vite";
import { nexusDevTools } from "@noverax/nexus-devtools/sveltekit";

export default defineConfig({
  plugins: [sveltekit(), nexusDevTools()],
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
      code: `import { instrumentServer } from "@noverax/nexus-devtools-core";
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

// ── Remix ───────────────────────────────────────────────────────────────────

const REMIX: FrameworkConfig = {
  id: "remix",
  name: "Remix",
  description: "React framework with Vite",
  steps: [
    installStep("@noverax/nexus-devtools @noverax/nexus-devtools-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "Remix uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "vite.config.ts",
      lang: "ts",
      code: `import { vitePlugin as remix } from "@remix-run/dev";
import { nexusDevTools } from "@noverax/nexus-devtools/remix";

export default defineConfig({
  plugins: [remix(), nexusDevTools()],
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
      code: `import { instrumentServer } from "@noverax/nexus-devtools-core";
import { sources } from "~/api";

if (process.env.NODE_ENV === "development") {
  instrumentServer({ sources });
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── Astro ───────────────────────────────────────────────────────────────────

const ASTRO: FrameworkConfig = {
  id: "astro",
  name: "Astro",
  description: "Content-driven framework with SSR",
  steps: [
    installStep("@noverax/nexus-devtools @noverax/nexus-devtools-core"),
    {
      id: "instrument-client",
      title: "Add Astro integration",
      description: "Auto-injects client connection on every page in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "astro.config.mjs",
      lang: "ts",
      code: `import { defineConfig } from "astro/config";
import { nexusDevTools } from "@noverax/nexus-devtools/astro";

export default defineConfig({
  integrations: [nexusDevTools()],
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
      code: `import { instrumentServer } from "@noverax/nexus-devtools-core";
import { sources } from "./api";

if (import.meta.env.DEV) {
  instrumentServer({ sources });
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── Angular ─────────────────────────────────────────────────────────────────

const ANGULAR: FrameworkConfig = {
  id: "angular",
  name: "Angular",
  description: "Full-featured platform by Google",
  steps: [
    installStep("@noverax/nexus-devtools"),
    {
      id: "instrument",
      title: "Initialize DevTools",
      description: "Call the setup function before bootstrapping your app.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "src/main.ts",
      lang: "ts",
      code: `import { setupNexusDevTools } from "@noverax/nexus-devtools/angular";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

setupNexusDevTools();

bootstrapApplication(AppComponent, appConfig);`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── Solid Start ─────────────────────────────────────────────────────────────

const SOLID: FrameworkConfig = {
  id: "solid",
  name: "Solid Start",
  description: "Solid.js meta-framework",
  steps: [
    installStep("@noverax/nexus-devtools @noverax/nexus-devtools-core"),
    {
      id: "instrument-client",
      title: "Add Vite plugin",
      description: "Solid Start uses Vite — auto-injects client connection in dev mode.",
      icon: Cable,
      actionLabel: "Copy snippet",
      filePath: "app.config.ts",
      lang: "ts",
      code: `import { defineConfig } from "@solidjs/start/config";
import { nexusDevTools } from "@noverax/nexus-devtools/solid";

export default defineConfig({
  vite: { plugins: [nexusDevTools()] },
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
      code: `import { instrumentServer } from "@noverax/nexus-devtools-core";
import { sources } from "./api";

if (import.meta.env.DEV) {
  instrumentServer({ sources });
}`,
    },
    VERIFY_STEP,
    EXPLORE_STEP,
  ],
};

// ── Export ───────────────────────────────────────────────────────────────────

export const FRAMEWORKS: FrameworkConfig[] = [
  NEXTJS, NUXT, REACT, VUE, SVELTEKIT, REMIX, ASTRO, ANGULAR, SOLID,
];

export const WELCOME_STORAGE_KEY = "nexus-devtools-v2:welcome-completed";
