/**
 * A package manager: how it runs Courier's one command, which sets Studio
 * up with its plugin, a mock and the scripts; how it starts Studio and the
 * app through the scripts the command adds; and the words for doing it by
 * hand — adding the dev dependency, and starting Studio by the package's
 * full name wherever the runner would fetch from npm, while pnpm only ever
 * runs what the project installed.
 */
export const PACKAGE_MANAGERS = [
  {
    id: "npm",
    setup: ["npx", "@noverax/create-courier@latest"],
    studio: "npm run studio",
    dev: "npm run dev",
    add: "npm install -D",
    run: ["npx", "@noverax/courier-studio"],
  },
  {
    id: "pnpm",
    setup: ["pnpm create", "@noverax/courier"],
    studio: "pnpm studio",
    dev: "pnpm dev",
    add: "pnpm add -D",
    run: ["pnpm exec", "courier-studio"],
  },
  {
    id: "yarn",
    setup: ["yarn create", "@noverax/courier"],
    studio: "yarn studio",
    dev: "yarn dev",
    add: "yarn add -D",
    run: ["yarn", "courier-studio"],
  },
  {
    id: "bun",
    setup: ["bun create", "@noverax/courier"],
    studio: "bun run studio",
    dev: "bun run dev",
    add: "bun add -d",
    run: ["bunx", "@noverax/courier-studio"],
  },
] as const

/** One of the package managers the setup offers. */
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

/**
 * The package manager picked, or npm for one the setup does not offer.
 *
 * @param id - The package manager's name
 * @returns Its words
 * @example
 * ```ts
 * managerOf("pnpm").setup.join(" ") // "pnpm create @noverax/courier"
 * ```
 */
export function managerOf(id: string): PackageManager {
  return PACKAGE_MANAGERS.find((manager) => manager.id === id) ?? PACKAGE_MANAGERS[0]
}

/** Studio's package. */
export const STUDIO_PACKAGE = "@noverax/courier-studio"

/** A framework's way of connecting to Studio: the file, and what goes in it. */
export interface Connection {
  id: "react" | "vue" | "next" | "nuxt" | "sveltekit"
  label: string
  file: string
  code: string
}

/**
 * How five frameworks connect their app to Studio, as Studio's guide
 * gives it. Next.js 16 builds with Turbopack, so it connects from
 * `instrumentation-client.ts`.
 *
 * @example
 * ```ts
 * CONNECTIONS[2].file // "instrumentation-client.ts"
 * ```
 */
export const CONNECTIONS: readonly Connection[] = [
  {
    id: "react",
    label: "React",
    file: "vite.config.ts",
    code: 'import react from "@vitejs/plugin-react"\nimport { courierStudio } from "@noverax/courier-studio/react"\nimport { defineConfig } from "vite"\n\nexport default defineConfig({\n  plugins: [react(), courierStudio()],\n})',
  },
  {
    id: "vue",
    label: "Vue",
    file: "vite.config.ts",
    code: 'import vue from "@vitejs/plugin-vue"\nimport { courierStudio } from "@noverax/courier-studio/vue"\nimport { defineConfig } from "vite"\n\nexport default defineConfig({\n  plugins: [vue(), courierStudio()],\n})',
  },
  {
    id: "next",
    label: "Next.js",
    file: "instrumentation-client.ts",
    code: 'import { attachRuntime } from "@noverax/courier-studio-core/runtime"\n\nif (process.env.NODE_ENV === "development") {\n  attachRuntime("next-browser")\n}',
  },
  {
    id: "nuxt",
    label: "Nuxt",
    file: "nuxt.config.ts",
    code: 'import { courierStudioModule } from "@noverax/courier-studio/nuxt"\n\nexport default defineNuxtConfig({\n  modules: [courierStudioModule],\n})',
  },
  {
    id: "sveltekit",
    label: "SvelteKit",
    file: "vite.config.ts",
    code: 'import { sveltekit } from "@sveltejs/kit/vite"\nimport { courierStudio } from "@noverax/courier-studio/sveltekit"\nimport { defineConfig } from "vite"\n\nexport default defineConfig({\n  plugins: [sveltekit(), courierStudio()],\n})',
  },
]

/**
 * The setup's three steps.
 *
 * @example
 * ```ts
 * SETUP_STEPS[0].title // "Set it up"
 * ```
 */
export const SETUP_STEPS = [
  {
    title: "Set it up",
    text: "One command adds Studio, its plugin and a mock to work against — after showing the plan.",
  },
  {
    title: "Connect your app",
    text: "The command adds courierStudio() to your bundler config; by hand, it is all you add.",
  },
  {
    title: "Start Studio",
    text: "Run it next to your dev server; your app connects on its own.",
  },
] as const
