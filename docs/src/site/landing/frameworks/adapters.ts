/** An official server adapter: where it mounts, what it is called, and the code that mounts it. */
export interface Adapter {
  label: string
  /** The file the mount lives in. */
  file: string
  pkg: string
  /** The handler the adapter exports, as it is mounted. */
  handler: string
  code: string
}

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
    handler: "apiRoute()",
    code: 'import { apiRoute } from "@noverax/courier-next"\n\nexport const { GET, POST } = apiRoute()',
  },
  {
    label: "Nuxt",
    file: "server/api/request.ts",
    pkg: "@noverax/courier-nuxt",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-nuxt"\n\nexport default courierHandler()',
  },
  {
    label: "SvelteKit",
    file: "src/routes/api/request/+server.ts",
    pkg: "@noverax/courier-sveltekit",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-sveltekit"\n\nconst handler = courierHandler()\nexport const GET = handler\nexport const POST = handler',
  },
  {
    label: "Astro",
    file: "src/pages/api/request.ts",
    pkg: "@noverax/courier-astro",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-astro"\n\nexport const prerender = false\n\nconst handler = courierHandler()\nexport const GET = handler\nexport const POST = handler',
  },
  {
    label: "Remix",
    file: "app/routes/api.request.ts",
    pkg: "@noverax/courier-remix",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-remix"\n\nconst handler = courierHandler()\nexport const loader = handler\nexport const action = handler',
  },
  {
    label: "SolidStart",
    file: "src/routes/api/request.ts",
    pkg: "@noverax/courier-solid",
    handler: "courierHandler()",
    code: 'import { courierHandler } from "@noverax/courier-solid"\n\nconst handler = courierHandler()\nexport const GET = handler\nexport const POST = handler',
  },
  {
    label: "Hono",
    file: "src/index.ts",
    pkg: "@noverax/courier-hono",
    handler: "courierHandler()",
    code: 'import { Hono } from "hono"\nimport { courierHandler } from "@noverax/courier-hono"\n\nconst app = new Hono()\n\napp.all("/api/request", courierHandler())\n\nexport default app',
  },
  {
    label: "Express",
    file: "src/server.ts",
    pkg: "@noverax/courier-express",
    handler: "courierHandler()",
    code: 'import express from "express"\nimport { courierHandler } from "@noverax/courier-express"\n\nconst app = express()\n\napp.all("/api/request", courierHandler())\n\napp.listen(3000)',
  },
  {
    label: "Fastify",
    file: "src/server.ts",
    pkg: "@noverax/courier-fastify",
    handler: "courierPlugin",
    code: 'import Fastify from "fastify"\nimport { courierPlugin } from "@noverax/courier-fastify"\n\nconst app = Fastify()\n\nawait app.register(courierPlugin, {\n  prefix: "/api/request",\n})\n\nawait app.listen({ port: 3000 })',
  },
  {
    label: "NestJS",
    file: "src/app.module.ts",
    pkg: "@noverax/courier-nestjs",
    handler: "courierMiddleware()",
    code: 'import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common"\nimport { courierMiddleware } from "@noverax/courier-nestjs"\n\n@Module({})\nexport class AppModule implements NestModule {\n  configure(consumer: MiddlewareConsumer) {\n    consumer.apply(courierMiddleware()).forRoutes("api/request")\n  }\n}',
  },
]

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
