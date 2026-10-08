/** A module a project imports from, and what it holds. */
export interface EntryPoint {
  module: string
  note: string
}

/**
 * The modules Courier's exports are imported from, each with the exports
 * a project reaches for there — the packages and subpaths as published.
 *
 * @example
 * ```ts
 * ENTRY_POINTS[0].module // "@noverax/courier"
 * ```
 */
export const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    module: "@noverax/courier",
    note: "createCaller, createProxyCaller, createHandler, HTTPError, isHTTPError, registerSources",
  },
  {
    module: "@noverax/courier/define",
    note: "courier, defineApi, defineGroup, defineBoundary, formBody, formQuery",
  },
  { module: "@noverax/courier/config", note: "defineConfig — the shape of courier.config.ts" },
  { module: "@noverax/courier/middleware", note: "defineMiddleware, composeMiddleware" },
  {
    module: "@noverax/courier/realtime",
    note: "createMemoryPubSub, createMemoryStream, createMemoryPresence, subscribeSSE, tracked",
  },
  { module: "@noverax/courier/openapi", note: "toOpenAPI — the definition as an OpenAPI document" },
  {
    module: "@noverax/courier/testing",
    note: "createTestClient, findRequests, createMockSSESubscription, createMockWSChannel",
  },
  {
    module: "@noverax/courier-react",
    note: "createQueryCaller, createProxyQueryCaller, createQueryKeys, useConnectionStatus",
  },
  { module: "@noverax/courier-next", note: "apiRoute(), sseRoute(), createAction()" },
  {
    module: "@noverax/courier-nuxt · -hono · -express · -astro · -remix · -solid · -sveltekit",
    note: "courierHandler()",
  },
  { module: "@noverax/courier-fastify · -nestjs", note: "courierPlugin, courierMiddleware()" },
  { module: "@noverax/courier-server", note: "createCourierServer — the standalone server" },
  {
    module: "@noverax/courier-redis",
    note: "createRedisPubSub, createRedisStream, createRedisPresence",
  },
]

/** A starter of the endpoint builder, the kind of call it begins, and what it is for. */
export interface BuilderVerb {
  method: string
  call: string
  desc: string
  tone: "get" | "post" | "put" | "del" | "muted"
}

/**
 * How an endpoint begins: `endpoint.<verb>(path)` for a request, `stream`
 * and `channel` for what stays open — each chained with `.variables()` and
 * `.response()` from there.
 *
 * @example
 * ```ts
 * BUILDER_VERBS.map((v) => v.call) // ["endpoint.get(path)", …]
 * ```
 */
export const BUILDER_VERBS: readonly BuilderVerb[] = [
  {
    method: "GET",
    call: "endpoint.get(path)",
    desc: "A read; variables not in the path go to the query string.",
    tone: "get",
  },
  {
    method: "HEAD",
    call: "endpoint.head(path)",
    desc: "A read answered with headers and no body.",
    tone: "muted",
  },
  {
    method: "OPTIONS",
    call: "endpoint.options(path)",
    desc: "What the address allows.",
    tone: "muted",
  },
  {
    method: "POST",
    call: "endpoint.post(path)",
    desc: "A write; variables not in the path go in the body.",
    tone: "post",
  },
  {
    method: "PUT",
    call: "endpoint.put(path)",
    desc: "Replaces the resource at the address.",
    tone: "put",
  },
  {
    method: "PATCH",
    call: "endpoint.patch(path)",
    desc: "Changes part of the resource at the address.",
    tone: "put",
  },
  {
    method: "DELETE",
    call: "endpoint.del(path)",
    desc: "Deletes it; variables not in the path go to the query string. Named del() as delete is reserved.",
    tone: "del",
  },
  {
    method: "STREAM",
    call: "stream.get(path)",
    desc: "Server-sent events another process serves; .implement() serves them here.",
    tone: "get",
  },
  {
    method: "CHANNEL",
    call: "channel.connect(path)",
    desc: "A WebSocket channel another process serves; .implement() serves it here.",
    tone: "post",
  },
]
