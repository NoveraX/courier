import type { SimpleIcon } from "simple-icons"
import {
  siAstro,
  siBun,
  siCloudflareworkers,
  siDeno,
  siExpress,
  siFastify,
  siHono,
  siNestjs,
  siNextdotjs,
  siNodedotjs,
  siNuxt,
  siReact,
  siRemix,
  siSolid,
  siSvelte,
  siVuedotjs,
} from "simple-icons"

/** A framework or runtime as the landing page shows it. */
export interface Brand {
  name: string
  /** What Courier offers it: the handler, the package, the way in. */
  sub: string
  /** The brand mark's SVG path, on a 24 × 24 box. */
  path: string
  /** Its colour on the dark ground, `#rrggbb`; a pale one is drawn in the text colour. */
  hex: string
}

function brand(icon: SimpleIcon, name: string, sub: string, hex: string): Brand {
  return { name, sub, path: icon.path, hex }
}

/**
 * Every official server adapter, by the handler it mounts. Colours are
 * picked for the dark ground.
 *
 * @example
 * ```ts
 * ADAPTER_BRANDS.map((b) => b.name) // ["Next.js", "Nuxt", …]
 * ```
 */
export const ADAPTER_BRANDS: readonly Brand[] = [
  brand(siNextdotjs, "Next.js", "apiRoute()", "#f2f3f5"),
  brand(siNuxt, "Nuxt", "courierHandler()", "#00dc82"),
  brand(siSvelte, "SvelteKit", "courierHandler()", "#ff3e00"),
  brand(siAstro, "Astro", "courierHandler()", "#bc52ee"),
  brand(siRemix, "Remix", "courierHandler()", "#e6e8eb"),
  brand(siSolid, "SolidStart", "courierHandler()", "#76b3e1"),
  brand(siHono, "Hono", "courierHandler()", "#ff7a2f"),
  brand(siExpress, "Express", "courierHandler()", "#e6e8eb"),
  brand(siFastify, "Fastify", "courierPlugin", "#e6e8eb"),
  brand(siNestjs, "NestJS", "courierMiddleware()", "#f0476a"),
]

/**
 * Where else a Courier call runs: the client bindings and the runtimes the
 * Hono adapter carries it to.
 *
 * @example
 * ```ts
 * RUNTIME_BRANDS[0].sub // "@noverax/courier-react"
 * ```
 */
export const RUNTIME_BRANDS: readonly Brand[] = [
  brand(siReact, "React", "@noverax/courier-react", "#61dafb"),
  brand(siVuedotjs, "Vue", "createProxyCaller", "#4fc08d"),
  brand(siNodedotjs, "Node.js", "direct mode", "#6cc24a"),
  brand(siBun, "Bun", "via Hono", "#fbf0df"),
  brand(siDeno, "Deno", "via Hono", "#e6e8eb"),
  brand(siCloudflareworkers, "Cloudflare Workers", "via Hono", "#f38020"),
]

/**
 * Whether a brand colour is too pale to draw on a light ground: its
 * perceived brightness is over 200 of 255.
 *
 * @param hex - The colour, `#rrggbb`
 * @returns Whether to draw the mark in the text colour instead
 * @example
 * ```ts
 * isPale("#f2f3f5") // true
 * ```
 */
export function isPale(hex: string): boolean {
  const [r, g, b] = rgbOf(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 200
}

/**
 * A `#rrggbb` colour as the three channels CSS's `rgb()` takes.
 *
 * @param hex - The colour
 * @returns Its red, green and blue, 0–255
 * @example
 * ```ts
 * rgbOf("#00dc82") // [0, 220, 130]
 * ```
 */
export function rgbOf(hex: string): [number, number, number] {
  const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16)
  return [channel(1), channel(3), channel(5)]
}
