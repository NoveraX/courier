import type { ProxyRateLimit } from "../adapter/rate-limit/types";
import type { AllowedHostsSetting, AllowedOriginsSetting } from "../adapter/runtime-policy";
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

/**
 * A secret named by the environment variable that holds it, read when it is
 * needed: the config holds the variable's name, never the value. Studio and
 * `courier-studio` read the variable from their own environment, which takes
 * the project's `.env*` files in, and say a variable is not set by its name.
 */
export interface CourierSecretRef {
  /** The environment variable that holds the secret: capitals, digits and `_`, not starting with a digit — `ORDERS_SPEC_TOKEN`. */
  env: string;
}

/** A secret an import's auth sends: as the config computes it, or a reference to the variable that holds it. */
export type CourierSecretValue = string | CourierSecretRef;

/**
 * Auth payload used to fetch private specs. Each secret may be a reference
 * to the environment, `{ env: "ORDERS_SPEC_TOKEN" }` — what Studio writes,
 * so no value is written into the config — or a string the config computes.
 */
export type CourierImportAuth =
  | { type: "bearer"; token: CourierSecretValue }
  | { type: "basic"; username: CourierSecretValue; password: CourierSecretValue }
  | { type: "header"; headers: Record<string, CourierSecretValue> };

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
  /**
   * Where the routes module goes: the module a page's proxy client imports,
   * which names every endpoint marked `.expose()` and how the page reaches
   * it, and nothing else of the API. A path in the project, from its root,
   * to a `.ts`, `.mts`, `.js` or `.mjs` file: `"src/courier.routes.ts"`.
   * Left out, it is `courier.routes.ts` beside courier.config, or
   * `courier.routes.js` beside a JavaScript one; `false` keeps the project
   * without one. Studio writes it each time courier.config loads with an
   * endpoint a page may call, and `courier-cli routes` writes it without
   * Studio — or, with `--check`, fails when it is out of date. Neither
   * writes over a file Courier did not write.
   */
  routes?: string | false | undefined;
}

/** What the `courier-server` command reads when its flags say nothing. */
export interface CourierServerConfig {
  /** Port to listen on — default 3001; `--port` overrides it */
  port?: number | undefined;
  /** Host to bind — default "127.0.0.1"; `--host` overrides it */
  host?: string | undefined;
  /**
   * Origins of the browser apps that call the server: a list, or a function
   * called when the first request comes in. Left out — or the function
   * answering `undefined` — the server reads `COURIER_ALLOWED_ORIGINS`,
   * comma-separated, and without it answers only its own origin, and
   * loopback ones outside production. `--allowed-origins` overrides both.
   */
  allowedOrigins?: AllowedOriginsSetting | undefined;
  /**
   * Host names the server is reached by: a list, or a function called when
   * the first request comes in. A request or a socket addressed to any other
   * host is refused with 421 — or closed with 4421 — as a DNS-rebinding
   * page's would be. Loopback names and IP literals are always served. Left
   * out — or the function answering `undefined` — the server reads
   * `COURIER_ALLOWED_HOSTS`, comma-separated, and without it production
   * serves every name and development nothing else. `--allowed-hosts`
   * overrides both.
   */
  allowedHosts?: AllowedHostsSetting | undefined;
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
  /**
   * How the server keeps an upload while its call runs: `"auto"` — the
   * default — holds up to `uploadMemoryBytes` of its files in memory and
   * writes the rest to `uploadDirectory`; `"memory"` never writes one to
   * disk; `"stream"` keeps none of it, sending it on to the upstream as it
   * arrives.
   */
  uploadMode?: "auto" | "memory" | "stream" | undefined;
  /** How many bytes of one upload's files stay in memory before the rest go to disk — default 1 MB. */
  uploadMemoryBytes?: number | undefined;
  /** How many bytes every upload holds in memory at once — default 64 MB; past it a file goes to disk, or the upload is refused with 503. */
  totalUploadMemoryBytes?: number | undefined;
  /** How many bytes every upload holds on disk at once — default 1 GB; past it an upload is refused with 503. */
  totalUploadDiskBytes?: number | undefined;
  /** Where each upload's own folder is made, removed once its call is done — `os.tmpdir()` unless set. */
  uploadDirectory?: string | undefined;
  /** The most fields and files one upload may hold — default 1000. */
  maxUploadParts?: number | undefined;
  /** The longest pause between two pieces of a request body, in milliseconds — default 30 seconds. */
  bodyIdleTimeoutMs?: number | undefined;
  /** The longest a request body may take to arrive, in milliseconds — default 5 minutes. */
  bodyTimeoutMs?: number | undefined;
  /**
   * How many calls one caller may make through the server: every call takes
   * from `requests` in each `window`, a write from `writes` as well, and a
   * call past either is answered 429. Left out, nobody is limited.
   */
  rateLimit?: ProxyRateLimit | undefined;
  /**
   * Answer only what a browser sent, refusing with 403 a request with
   * neither `Sec-Fetch-Site` nor `Origin` — a filter for noise, not a lock.
   * Studio's Playground gets through in development alone, on a one-time pass.
   */
  browsersOnly?: boolean | undefined;
}

/**
 * Runtime configuration — metadata the user-app process needs at startup
 * that cannot be auto-discovered reliably across every deployment target.
 *
 * Consumed by `attachRuntime()` when it loads `courier.config.ts` from disk.
 * Every field is optional; omit the whole `runtime` block for the common
 * dev case, where the app learns its origin from the server itself.
 */
export interface CourierRuntimeConfig {
  /**
   * Canonical HTTP(S) origin the user-app listens on (e.g. `http://localhost:3000`).
   *
   * Where Studio's Playground sends its proxy calls — requests, streams and
   * channels alike — when the source's `proxyPath` is relative, as it is by
   * default: Node `fetch`/`new WebSocket` reject relative URLs and
   * `globalThis.location` is unavailable in server contexts, so an origin is
   * required to resolve them to absolute URLs.
   *
   * Resolution order inside `attachRuntime()`:
   *   1. This field (`config.runtime.appOrigin`)
   *   2. `COURIER_APP_URL` environment variable
   *   3. `APP_URL` environment variable
   *   4. In development, the server itself, never a request's headers: the
   *      address Studio's Vite plugin or Nuxt module sees the dev server
   *      serve on, the one Next.js records as it starts, a standalone
   *      server's `.listen()` address, or the socket of the first request a
   *      Courier route serves
   *   5. Undefined — a Playground proxy call throws
   *      `ConfigurationError("APP_ORIGIN_NOT_CONFIGURED")`
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
