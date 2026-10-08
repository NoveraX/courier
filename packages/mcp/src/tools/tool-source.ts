import { ConfigurationError, getSources } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { getSourcesGeneration } from "@noverax/courier/internal";

import { buildCatalog, type Catalog, type CatalogOptions } from "./catalog";

/** Where a server's tools come from: the sources in force, and the catalog built from them. */
export interface ToolSource {
  /** The sources a tool's call runs against. */
  readonly sources: () => Sources;
  /** The tools, rebuilt when the registered sources are replaced. */
  readonly catalog: () => Catalog;
}

/**
 * The tools of the given sources, or of the ones the application
 * registered — read when a request needs them, and rebuilt when a dev
 * server registers them again after an edit.
 *
 * Sources handed over are checked here, so a tool that cannot be offered
 * stops the application at its start rather than at an agent's first call.
 *
 * @param given - The sources, or `undefined` for the registered ones
 * @param options - Which of them, and how their schemas are written
 * @returns The tool source
 * @throws ConfigurationError when given sources hold a tool that cannot be offered
 * @example
 * ```ts
 * const tools = toolSource({ shop }, {});
 * tools.catalog().tools.length;
 * ```
 */
export function toolSource(given: Sources | undefined, options: CatalogOptions): ToolSource {
  if (given !== undefined) {
    const catalog = buildCatalog(given, options);
    return { sources: () => given, catalog: () => catalog };
  }
  let built: { generation: number; catalog: Catalog } | undefined;
  const sources = (): Sources => {
    const registered = getSources();
    if (registered === undefined) {
      throw new ConfigurationError(
        "SOURCES_NOT_REGISTERED",
        "[courier] No sources are registered, so there are no tools to offer: pass sources, or register them first.",
      );
    }
    return registered;
  };
  return {
    sources,
    catalog() {
      const generation = getSourcesGeneration();
      if (built?.generation !== generation)
        built = { generation, catalog: buildCatalog(sources(), options) };
      return built.catalog;
    },
  };
}
