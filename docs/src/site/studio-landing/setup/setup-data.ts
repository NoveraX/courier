/** A package manager, with the words that add a dev dependency. */
export const PACKAGE_MANAGERS = [
  { id: "npm", add: "npm install -D" },
  { id: "pnpm", add: "pnpm add -D" },
  { id: "bun", add: "bun add -d" },
] as const

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
 * SETUP_STEPS[2].title // "Start Studio"
 * ```
 */
export const SETUP_STEPS = [
  { title: "Install", text: "One dev dependency; production builds leave it out." },
  { title: "Connect your app", text: "Add courierStudio() to your bundler config." },
  {
    title: "Start Studio",
    text: "Run npx courier-studio next to your dev server; your app connects on its own.",
  },
] as const
