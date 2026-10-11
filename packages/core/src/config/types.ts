import type { AgentPolicy } from "../agent/agent-policy";
import type { AnySource } from "../define/types";

/** Spec format for an OpenAPI/GraphQL/etc. import entry */
export type CourierImportSpecType = "openapi" | "swagger" | "graphql" | "asyncapi" | "postman";

/** Validation library produced by codegen */
export type CourierImportValidation = "zod" | "valibot" | "arktype" | "none";

/** Endpoint grouping strategy for codegen */
export type CourierImportGroupBy = "tag" | "path" | "single";

/** Generated client mode */
export type CourierImportGenerateClient = "direct" | "proxy" | "both" | "none";

/** Auth payload used to fetch private specs */
export type CourierImportAuth =
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "header"; headers: Record<string, string> };

/**
 * Endpoints of a specification, named by any of these: an endpoint is
 * named when it carries one of the tags, its path is one of the paths as
 * the specification writes it (`/pets/{id}`), or its operationId is listed.
 */
export interface CourierImportSelector {
  tags?: string[] | undefined;
  paths?: string[] | undefined;
  operationIds?: string[] | undefined;
}

/** Discriminator for how a spec was imported */
export type CourierImportType = "url" | "file" | "raw";

/**
 * Fields shared by every import declaration. Codegen options are flat (not
 * nested in an `options` object) so user-authored `courier.config.ts` reads
 * naturally.
 *
 * `transform` accepts and returns `unknown` rather than `ParsedSpec` because
 * the parsed-spec type lives in `@noverax/courier-studio` and `core` must not
 * depend on Studio. Studio's import runner narrows back to `ParsedSpec` at
 * the call site where it controls both ends of the type contract.
 */
export interface CourierImportBase {
  /** Spec format — determines the parser used at codegen time */
  type: CourierImportSpecType;
  /**
   * The directory, relative to the project, that holds the import's own
   * directory: Studio writes the import's files into
   * `<outputDir>/<source-name>/`, the source name in kebab case.
   */
  outputDir: string;
  /** Source name for the generated `defineApi` call (default: import key) */
  sourceName?: string | undefined;
  validation?: CourierImportValidation | undefined;
  groupBy?: CourierImportGroupBy | undefined;
  generateTypes?: boolean | undefined;
  generateSchemas?: boolean | undefined;
  generateClient?: CourierImportGenerateClient | undefined;
  addAuthMiddleware?: boolean | undefined;
  includeComments?: boolean | undefined;
  /** Only the endpoints it names are generated; applied after `transform`. */
  include?: CourierImportSelector | undefined;
  /** The endpoints it names are left out; applied after `include`. */
  exclude?: CourierImportSelector | undefined;
  /**
   * Run on a copy of the parsed specification before anything is generated
   * from it. It returns the specification to generate from, or changes the
   * copy in place and returns nothing.
   */
  transform?: ((spec: unknown) => unknown | Promise<unknown>) | undefined;
}

/**
 * Remote-URL import. Studio fetches `from` on demand and on auto-update
 * checks. Only this variant carries `from`/`auth`/`pinHash` because they are
 * meaningless for one-shot file/raw imports.
 */
export interface CourierUrlImport extends CourierImportBase {
  importType: "url";
  /** HTTP(S) URL Studio fetches at import + re-sync time */
  from: string;
  /** Sent with every fetch of `from`, to its own origin only: a redirect elsewhere goes without it */
  auth?: CourierImportAuth | undefined;
  /**
   * The only specification the import is generated from: its hash, as
   * Studio records it in `.courier/imports-state.json` under `specHash`.
   * A specification with another hash is refused.
   */
  pinHash?: string | undefined;
}

/**
 * Local-file import. The file path is supplied through the Studio UI at
 * import and at every re-sync — Studio never reaches back to disk on its
 * own, so no path is persisted in config.
 */
export interface CourierFileImport extends CourierImportBase {
  importType: "file";
}

/**
 * Inline-string import. The raw spec is supplied through the Studio UI at
 * import and at every re-sync.
 */
export interface CourierRawImport extends CourierImportBase {
  importType: "raw";
}

/** Declaration of a single API spec import */
export type CourierImportEntry = CourierUrlImport | CourierFileImport | CourierRawImport;

/** Studio dev-server configuration */
export interface CourierStudioConfig {
  /**
   * Studio HTTP/Socket.IO port, a whole number from 1 to 65535 — default
   * 6280. Studio reads it when it starts; `--port` overrides it.
   */
  port?: number | undefined;
  /** Bind host — default "localhost". Studio reads it when it starts; `--host` overrides it. */
  host?: string | undefined;
  /**
   * Where the ports Studio assigns to mocks that declare none begin, a whole
   * number from 1 to 65535 — default 7001. Studio reads it when it starts.
   */
  mockBasePort?: number | undefined;
  /** Open the Studio UI in the default browser on startup — default false */
  open?: boolean | undefined;
  /**
   * Hosts on a private network that Studio may fetch an API specification
   * from, beyond this machine.
   *
   * Studio reads a specification by URL on the developer's behalf, so it will
   * not walk into a network the developer cannot see from their own browser.
   * This machine needs no entry when the URL itself points there — a
   * specification served by the project's own dev server is the ordinary
   * case — nor for redirects while every hop stays on it. Once any hop has
   * been elsewhere, a redirect to this machine is treated as one to a
   * private host. Every redirect is checked this way before it is followed.
   * Name a private host explicitly to reach it, for example
   * `["gitlab.internal", "10.0.0.7:8080"]`: an entry without a port matches
   * the host on any port, and one with a port on that port only, where a URL
   * that names no port has its scheme's default (`gitlab.internal:443`
   * matches `https://gitlab.internal`). Entries match in any case, an IPv6
   * address with or without brackets. An entry written as a URL, with a
   * path, or ending in a dot never names a host, and the config is refused
   * with the entry named. An address that means every interface
   * (`0.0.0.0`, `::`) is never reached, even when listed.
   *
   * Studio reads this list only when a request would reach a private host,
   * as courier.config is on disk at that moment. While courier.config does
   * not load, no private host is allowed — not even one the last config that
   * loaded named — until it loads again. List hosts literally: a host
   * computed from something Studio does not watch, such as an environment
   * variable or a file the config reads, is taken as of the last load, and
   * one computed in a dependency Node loads natively (`.mjs`, `.cjs`, or `.js`
   * in an ES module package) as of the last time Node evaluated it.
   */
  allowedSpecHosts?: readonly string[] | undefined;
}

/** What the `courier-server` command reads when its flags say nothing. */
export interface CourierServerConfig {
  /** Port to listen on — default 3001; `--port` overrides it */
  port?: number | undefined;
  /** Host to bind — default "127.0.0.1"; `--host` overrides it */
  host?: string | undefined;
  /**
   * Origins of the browser apps that call the server. Left out, the server
   * answers only its own origin, and loopback ones outside production;
   * `--allowed-origins` overrides it.
   */
  allowedOrigins?: readonly string[] | undefined;
  /**
   * Host names the server is reached by. A request or a socket addressed to
   * any other host is refused with 421 — or closed with 4421 — as a
   * DNS-rebinding page's would be. Loopback names and IP literals are always
   * served; left out, production serves every name and development nothing
   * else. `--allowed-hosts` overrides it.
   */
  allowedHosts?: readonly string[] | undefined;
  /**
   * Largest JSON envelope the proxy reads, in bytes — default 1 MB. A larger
   * one is refused with 413 before it is read.
   */
  maxBodyBytes?: number | undefined;
  /**
   * Largest `multipart/form-data` upload the proxy reads, in bytes — default
   * 10 MB. A larger one is refused with 413 before it is read.
   */
  maxUploadBytes?: number | undefined;
}

/**
 * Runtime configuration — metadata the user-app process needs at startup
 * that cannot be auto-discovered reliably across every deployment target.
 *
 * Consumed by `attachRuntime()` when it loads `courier.config.ts` from disk.
 * Every field is optional; omit the whole `runtime` block for the common
 * dev case where Express/Fastify/Hono/NestJS adapters auto-discover the
 * listen origin from the first incoming request.
 */
export interface CourierRuntimeConfig {
  /**
   * Canonical HTTP(S) origin the user-app listens on (e.g. `http://localhost:3000`).
   *
   * Used by the Studio Playground proxy mode when `proxyPath.{sse,ws}` is a
   * relative path — Node `fetch`/`new WebSocket` reject relative URLs and
   * `globalThis.location` is unavailable in server contexts, so an explicit
   * origin is required to resolve them to absolute URLs.
   *
   * Resolution order inside `attachRuntime()`:
   *   1. This field (`config.runtime.appOrigin`)
   *   2. `COURIER_APP_URL` environment variable
   *   3. `APP_URL` environment variable
   *   4. Framework adapter auto-discovery (Express/Fastify/Hono/NestJS on
   *      first request; standalone server from `.listen()` callback)
   *   5. Undefined — Playground proxy SSE/WS throws
   *      `ConfigurationError("APP_ORIGIN_NOT_CONFIGURED")` on first use
   *
   * There is no magic `http://localhost:3000` fallback because the correct
   * value depends on your runtime (custom port, Docker, HTTPS, reverse
   * proxy, etc.) and a wrong guess would silently route to nowhere.
   */
  appOrigin?: string | undefined;
}

/**
 * Top-level shape of `courier.config.ts`.
 *
 * `TSources` is generic so per-source endpoint types survive into config-aware
 * tooling (codegen, type-checking against runtime values). Loose `AnySource`
 * is the floor; concrete `DefinedApi<...>` types narrow upward when callers
 * pass a typed object literal to `defineConfig`.
 *
 * Mock servers are not declared here: this file is also loaded in production
 * (by the runtime and the standalone server), so it must not import
 * development tools. They live in `courier.mocks.ts` beside it, which only
 * Studio reads.
 */
export interface CourierConfig<
  TSources extends Record<string, AnySource> = Record<string, AnySource>,
> {
  /** Map of named API sources */
  sources: TSources;
  /** OpenAPI/GraphQL/etc. import declarations */
  imports?: Record<string, CourierImportEntry> | undefined;
  studio?: CourierStudioConfig | undefined;
  server?: CourierServerConfig | undefined;
  runtime?: CourierRuntimeConfig | undefined;
  /**
   * What the project offers to AI agents: by default the endpoints marked
   * `.agent()` and nothing else. The MCP server, Studio and
   * `courier-studio diff` read it here; an application's own MCP endpoint
   * takes it as `createMcpHandler({ agents: config.agents })`.
   */
  agents?: AgentPolicy | undefined;
}
