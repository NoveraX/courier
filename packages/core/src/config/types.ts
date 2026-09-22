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
}

/** Standalone proxy server configuration */
export interface CourierServerConfig {
  port?: number;
  host?: string;
  /** Transports the standalone server should expose — default all three */
  transports?: ReadonlyArray<"http" | "sse" | "ws">;
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
 * `mocks` values use a structural shape rather than the concrete
 * `MockServerDefinition` from `@noverax/courier-mock` to preserve the
 * `core → mock` dependency direction (mock depends on core, never the
 * reverse). Studio's mock-registry narrows back at the consumption site.
 */
export interface CourierConfig<
  TSources extends Record<string, AnySource> = Record<string, AnySource>,
> {
  /** Map of named API sources */
  sources: TSources;
  /** OpenAPI/GraphQL/etc. import declarations */
  imports?: Record<string, CourierImportEntry>;
  /** Managed mock-server definitions */
  mocks?: Record<string, unknown>;
  studio?: CourierStudioConfig;
  server?: CourierServerConfig;
  runtime?: CourierRuntimeConfig;
}
