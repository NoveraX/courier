/**
 * The routes of every API a page's proxy client may call, built from the
 * project's `courier.config` by Courier's bundler plugin, which puts them in
 * this module's place in the page's bundle. Only what a page needs to reach
 * each endpoint is built in — never the definitions, their addresses or their
 * middleware.
 *
 * Without the plugin, the module here is the one the package ships, which
 * holds no routes: reading one throws `ConfigurationError`
 * `ROUTES_NOT_BUILT`. A project that does not use the plugin gives its
 * clients the routes module `courier-cli routes` writes instead.
 */

import type { ExposedPaths } from "../define/exposed-paths";
import type { CourierRoutes, ExposedRoutes, NamesItsEndpoints } from "../define/routes";
import { ConfigurationError } from "../errors";

/**
 * What a project registers once, so `routes` is typed from its config —
 * written in a module its TypeScript sees, usually the one that creates the
 * proxy clients. The config is imported as a type alone, so it never reaches
 * a page's bundle.
 *
 * @example
 * ```ts
 * import type config from "../courier.config";
 *
 * declare module "@noverax/courier/routes" {
 *   interface Register {
 *     config: typeof config;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: a project fills it in with `declare module`
export interface Register {}

/** What `routes` is until a config is registered: its one key says what to add. */
export interface RoutesNeedRegister {
  readonly 'Register the config: declare module "@noverax/courier/routes" { interface Register { config: typeof config } }': never;
}

/**
 * What `routes` is when the registered config types its sources as any
 * record of APIs, which names none: its one key says how to type them.
 */
export interface RoutesNeedTypedSources {
  readonly "Type the config's sources: write it with defineConfig({ sources: { … } }) rather than as CourierConfig": never;
}

/** A config as registered: the module's default export where its namespace was registered. */
type ConfigOf<TConfig> = TConfig extends { sources: unknown }
  ? TConfig
  : TConfig extends { default: infer TDefault }
    ? TDefault
    : TConfig;

/** The sources a config registers, by name; never for anything else. */
type SourcesOf<TConfig> = TConfig extends { sources: infer TSources } ? TSources : never;

/** The names of the sources that may open an endpoint to a page: all but those whose types prove none. */
type OpeningSources<TSources> = {
  [K in keyof TSources]: NamesItsEndpoints<TSources[K]> extends true
    ? [ExposedPaths<TSources[K]>] extends [never]
      ? never
      : K
    : K;
}[keyof TSources];

/**
 * The routes of every source of a config that may open an endpoint to a
 * page, by the source's name. The plugin builds routes for every source;
 * one whose types prove it opens nothing is left out here, so a client of
 * it does not compile.
 *
 * @example
 * ```ts
 * type Routes = ConfigRoutes<typeof config>; // { shop: ExposedRoutes<typeof shop> }
 * ```
 */
export type ConfigRoutes<TConfig> = 0 extends 1 & TConfig
  ? Readonly<Record<string, CourierRoutes>>
  : [SourcesOf<ConfigOf<TConfig>>] extends [never]
    ? RoutesNeedRegister
    : string extends keyof SourcesOf<ConfigOf<TConfig>>
      ? RoutesNeedTypedSources
      : {
          readonly [K in OpeningSources<SourcesOf<ConfigOf<TConfig>>>]: ExposedRoutes<
            SourcesOf<ConfigOf<TConfig>>[K]
          >;
        };

/** The routes `routes` holds: those of the registered config, or a type that says to register it. */
export type RegisteredRoutes = Register extends { config: infer TConfig }
  ? ConfigRoutes<TConfig>
  : RoutesNeedRegister;

/* Reads any value gets from the tools around it — a promise check, JSON, a
   renderer, a test matcher, a reactive store — are answered with nothing, and
   what every object has, `toString` among it, as any object answers them, so
   the module stays safe to look at; a read of a route is refused. */
const LOOKED_AT = new Set([
  "then",
  "toJSON",
  "length",
  "$$typeof",
  "asymmetricMatch",
  "nodeType",
  "_isMockFunction",
  "__esModule",
  "__v_isRef",
  "__v_skip",
  "@@__IMMUTABLE_ITERABLE__@@",
  "@@__IMMUTABLE_RECORD__@@",
]);

function notBuilt(source: string): ConfigurationError {
  return new ConfigurationError(
    "ROUTES_NOT_BUILT",
    `[courier] routes.${source} was read, but no bundler plugin built the routes into this ` +
      "bundle, so the module here is the one the package ships, which holds none. Add " +
      "Courier's plugin to the bundler that builds this page, or give the client the routes " +
      "module `courier-cli routes` writes.",
  );
}

/**
 * The routes of every API a page's proxy client may call, by the name the
 * config registers it under.
 *
 * @example
 * ```ts
 * import { createProxyCaller } from "@noverax/courier";
 * import { routes } from "@noverax/courier/routes";
 *
 * export const storefront = createProxyCaller(routes.shop);
 * ```
 */
export const routes: RegisteredRoutes = new Proxy(Object.freeze({}), {
  get(target, key) {
    if (typeof key !== "string" || key in target || LOOKED_AT.has(key)) {
      return Reflect.get(target, key);
    }
    throw notBuilt(key);
  },
}) as RegisteredRoutes;
