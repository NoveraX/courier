import {
  siAngular,
  siAstro,
  siNextdotjs,
  siNuxt,
  siReact,
  siRemix,
  siSolid,
  siSvelte,
  siVuedotjs,
} from "simple-icons"

/** A framework Studio connects to, and how. */
export interface StudioFramework {
  name: string
  /** What Studio hooks into. */
  hook: string
  /** The entry of `@noverax/courier-studio` it imports. */
  entry: string
  path: string
  /** Its colour when picked out, `#rrggbb`; a pale one is drawn in the text colour. */
  hex: string
}

/**
 * The frameworks with an entry of their own in `@noverax/courier-studio`,
 * by what each one hooks into.
 *
 * @example
 * ```ts
 * STUDIO_FRAMEWORKS.length // 9
 * ```
 */
export const STUDIO_FRAMEWORKS: readonly StudioFramework[] = [
  { name: "React", hook: "vite plugin", entry: "react", path: siReact.path, hex: "#61dafb" },
  { name: "Vue", hook: "vite plugin", entry: "vue", path: siVuedotjs.path, hex: "#4fc08d" },
  {
    name: "Next.js",
    hook: "instrumentation",
    entry: "next",
    path: siNextdotjs.path,
    hex: "#ffffff",
  },
  { name: "Nuxt", hook: "module", entry: "nuxt", path: siNuxt.path, hex: "#00dc82" },
  {
    name: "SvelteKit",
    hook: "vite plugin",
    entry: "sveltekit",
    path: siSvelte.path,
    hex: "#ff3e00",
  },
  { name: "Remix", hook: "vite plugin", entry: "remix", path: siRemix.path, hex: "#ffffff" },
  { name: "Astro", hook: "integration", entry: "astro", path: siAstro.path, hex: "#bc52ee" },
  { name: "Angular", hook: "main.ts", entry: "angular", path: siAngular.path, hex: "#dd0031" },
  { name: "SolidStart", hook: "vite plugin", entry: "solid", path: siSolid.path, hex: "#518ac8" },
]
