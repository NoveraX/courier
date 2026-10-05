/** An official server adapter: where it mounts, what it is called, the code that mounts it, and its guide. */
export interface Adapter {
  label: string
  /** The file the mount lives in. */
  file: string
  pkg: string
  /** The handler the adapter exports, as it is mounted. */
  handler: string
  code: string
  /** The docs page that walks through it. */
  guide: string
}

/** The docs page that lists every official adapter. */
export const ADAPTERS_OVERVIEW = "/docs/frameworks/overview"

/**
 * The adapters the landing page shows, in its order: Next.js, then the
 * frameworks npm counts the most weekly downloads for (October 2026). The
 * rest are a click away on the overview, so the block stays one size as
 * adapters are added.
 */
export const LANDING_ADAPTERS: readonly string[] = [
  "Next.js",
  "Express",
  "Hono",
  "NestJS",
  "Fastify",
  "Astro",
]

/**
 * Every official server adapter, mounted as its framework guide mounts it.
 * Sources are registered once elsewhere, so each mount is the import and
 * one call.
 *
 * @example
 * ```ts
 * ADAPTERS[0].handler // "apiRoute()"
 * ```
 */
export const ADAPTERS: readonly Adapter[] = [
  {
    label: "Next.js",
    file: "app/api/request/route.ts",
    pkg: "@noverax/courier-next",
    guide: "/docs/frameworks/nextjs",
    handler: "apiRoute()",
    code: 'import { apiRoute } from "@noverax/courier-next"\n\nexport const { GET, POST } = apiRoute()',
  },
  {
    label: "Nuxt",
    file: "server/api/request.ts",
    pkg: "@noverax/courier-nuxt",
    guide: "/docs/frameworks/nuxt",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-nuxt"\n\nexport default courierHandler()',
  },
  {
    label: "SvelteKit",
    file: "src/routes/api/request/+server.ts",
    pkg: "@noverax/courier-sveltekit",
    guide: "/docs/frameworks/sveltekit",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-sveltekit"\n\nconst handler = courierHandler()\nexport const GET = handler\nexport const POST = handler',
  },
  {
    label: "Astro",
    file: "src/pages/api/request.ts",
    pkg: "@noverax/courier-astro",
    guide: "/docs/frameworks/astro",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-astro"\n\nexport const prerender = false\n\nconst handler = courierHandler()\nexport const GET = handler\nexport const POST = handler',
  },
  {
    label: "Remix",
    file: "app/routes/api.request.ts",
    pkg: "@noverax/courier-remix",
    guide: "/docs/frameworks/remix",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-remix"\n\nconst handler = courierHandler()\nexport const loader = handler\nexport const action = handler',
  },
  {
    label: "SolidStart",
    file: "src/routes/api/request.ts",
    pkg: "@noverax/courier-solid",
    guide: "/docs/frameworks/solid-start",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-solid"\n\nconst handler = courierHandler()\nexport const GET = handler\nexport const POST = handler',
  },
  {
    label: "Hono",
    file: "src/index.ts",
    pkg: "@noverax/courier-hono",
    guide: "/docs/frameworks/hono",
    handler: "courierHandler()",
    code: 'import { Hono } from "hono"\nimport { courierHandler } from "@noverax/courier-hono"\n\nconst app = new Hono()\n\napp.all("/api/request", courierHandler())\n\nexport default app',
  },
  {
    label: "Express",
    file: "src/server.ts",
    pkg: "@noverax/courier-express",
    guide: "/docs/frameworks/express",
    handler: "courierHandler()",
    code: 'import express from "express"\nimport { courierHandler } from "@noverax/courier-express"\n\nconst app = express()\n\napp.all("/api/request", courierHandler())\n\napp.listen(3000)',
  },
  {
    label: "Fastify",
    file: "src/server.ts",
    pkg: "@noverax/courier-fastify",
    guide: "/docs/frameworks/fastify",
    handler: "courierPlugin",
    code: 'import Fastify from "fastify"\nimport { courierPlugin } from "@noverax/courier-fastify"\n\nconst app = Fastify()\n\nawait app.register(courierPlugin, {\n  prefix: "/api/request",\n})\n\nawait app.listen({ port: 3000 })',
  },
  {
    label: "NestJS",
    file: "src/app.module.ts",
    pkg: "@noverax/courier-nestjs",
    guide: "/docs/frameworks/nestjs",
    handler: "courierMiddleware()",
    code: 'import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common"\nimport { courierMiddleware } from "@noverax/courier-nestjs"\n\n@Module({})\nexport class AppModule implements NestModule {\n  configure(consumer: MiddlewareConsumer) {\n    consumer.apply(courierMiddleware()).forRoutes("api/request")\n  }\n}',
  },
]

/**
 * The adapters the landing page shows, in the order it shows them.
 *
 * @returns The adapters named in `LANDING_ADAPTERS`
 * @example
 * ```ts
 * landingAdapters()[0].label // "Next.js"
 * ```
 */
export function landingAdapters(): Adapter[] {
  return LANDING_ADAPTERS.flatMap((label) => ADAPTERS.filter((adapter) => adapter.label === label))
}

/**
 * The lines of an adapter's code that are its own — the ones naming its
 * handler — and the last of them, which the page labels.
 *
 * @param adapter - The adapter
 * @returns Per line, whether it is the adapter's own; and the last such line
 * @example
 * ```ts
 * ownLines(ADAPTERS[0]) // { own: [true, false, true], last: 2 }
 * ```
 */
export function ownLines(adapter: Adapter): { own: boolean[]; last: number } {
  const name = adapter.handler.replace("()", "")
  const own = adapter.code.split("\n").map((line) => line.includes(name))
  return { own, last: own.lastIndexOf(true) }
}
