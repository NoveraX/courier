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

/** Subset filter applied at codegen time */
export interface CourierImportSelector {
  tags?: string[];
  paths?: string[];
  operationIds?: string[];
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
  /** Where generated TS code is written */
  outputDir: string;
  /** Source name for the generated `defineApi` call (default: import key) */
  sourceName?: string;
  validation?: CourierImportValidation;
  groupBy?: CourierImportGroupBy;
  generateTypes?: boolean;
  generateSchemas?: boolean;
  generateClient?: CourierImportGenerateClient;
  addAuthMiddleware?: boolean;
  includeComments?: boolean;
  /** Whitelist filter applied first */
  include?: CourierImportSelector;
  /** Blacklist filter applied after `include` */
  exclude?: CourierImportSelector;
  /** Custom transform run between parse and codegen */
  transform?: (spec: unknown) => unknown | Promise<unknown>;
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
  /** Optional auth for fetching private specs */
  auth?: CourierImportAuth;
  /** Pinned spec hash for reproducible builds; mismatch aborts the import */
  pinHash?: string;
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

/**
 * A mock server declared under `mocks`: what `defineMockServer` from
 * `@noverax/courier-mock` returns.
 *
 * Core names it by shape because it does not depend on the mock package; the
 * mock package's definition extends it. A value that is not one — a source,
 * or options not passed through `defineMockServer` — is then rejected where
 * the config is written, instead of when Studio loads it.
 */
export interface CourierMockEntry {
  readonly __type: "courier-mock-server";
  /** The API the mock serves. */
  readonly source: AnySource;
}

/** Studio dev-server configuration */
export interface CourierStudioConfig {
  /** Studio HTTP/Socket.IO port — default 6280 */
  port?: number;
  /** Bind host — default "localhost" */
  host?: string;
  /** First port assigned to managed mock servers — default 7001 */
  mockBasePort?: number;
  /** Open the Studio UI in the default browser on startup — default false */
  open?: boolean;
  /**
   * Hosts on a private network that Studio may fetch an API specification
   * from, beyond this machine.
   *
   * Studio reads a specification by URL on the developer's behalf, so it will
   * not walk into a network the developer cannot see from their own browser.
   * Loopback needs no entry here — a specification served by the project's own
   * dev server is the ordinary case. Name a private host explicitly to reach
   * it, for example `["gitlab.internal", "10.0.0.7:8080"]`.
   */
  allowedSpecHosts?: readonly string[];
}

/** What the `courier-server` command reads when its flags say nothing. */
export interface CourierServerConfig {
  /** Port to listen on — default 3001; `--port` overrides it */
  port?: number;
  /** Host to bind — default "localhost"; `--host` overrides it */
  host?: string;
  /**
   * Origins of the browser apps that call the server. Left out, the server
   * answers only its own origin, and loopback ones outside production;
   * `--allowed-origins` overrides it.
   */
  allowedOrigins?: readonly string[];
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
  appOrigin?: string;
}

/**
 * Top-level shape of `courier.config.ts`.
 *
 * `TSources` is generic so per-source endpoint types survive into config-aware
 * tooling (codegen, type-checking against runtime values). Loose `AnySource`
 * is the floor; concrete `DefinedApi<...>` types narrow upward when callers
 * pass a typed object literal to `defineConfig`.
 *
 * `mocks` holds {@link CourierMockEntry} values, the shape core knows of a
 * `defineMockServer` result without depending on the mock package. A key
 * left `undefined` declares no mock.
 */
export interface CourierConfig<
  TSources extends Record<string, AnySource> = Record<string, AnySource>,
> {
  /** Map of named API sources */
  sources: TSources;
  /** OpenAPI/GraphQL/etc. import declarations */
  imports?: Record<string, CourierImportEntry>;
  /** Mock servers Studio runs, by key — each one a `defineMockServer()` result */
  mocks?: Record<string, CourierMockEntry | undefined>;
  studio?: CourierStudioConfig;
  server?: CourierServerConfig;
  runtime?: CourierRuntimeConfig;
}
