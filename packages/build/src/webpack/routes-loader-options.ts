import { isRecord } from "../util/is-record";

/**
 * What a rule hands the routes loader. Plain data alone, as Turbopack takes
 * a loader's options only as JSON.
 */
export interface RoutesLoaderOptions {
  /** The project's root, absolute: the config is looked for there and above it. */
  readonly root: string;
  /** The config file, absolute, when it is not the one found from the root. */
  readonly config?: string | undefined;
  /**
   * `"config-in-page"` on the rule that matches the config itself in a
   * page's bundle, which the loader refuses; none on the routes module's.
   */
  readonly refuse?: "config-in-page" | undefined;
}

/**
 * The loader's options, as the rule handed them.
 *
 * @param value - What the loader context's `getOptions()` gave
 * @returns The options
 * @throws Error when they are not the ones a Courier rule hands it
 * @example
 * ```ts
 * routesLoaderOptionsOf(this.getOptions()); // { root: "/app" }
 * ```
 */
export function routesLoaderOptionsOf(value: unknown): RoutesLoaderOptions {
  const root = isRecord(value) ? value.root : undefined;
  if (!isRecord(value) || typeof root !== "string") {
    throw new Error(
      "[courier] The routes loader was given no project root: add it through Courier's plugin or routesRule(), not by hand.",
    );
  }
  const config = typeof value.config === "string" ? value.config : undefined;
  const refuse = value.refuse === "config-in-page" ? "config-in-page" : undefined;
  return { root, config, refuse };
}
