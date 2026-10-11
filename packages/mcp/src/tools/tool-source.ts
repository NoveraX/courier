import { ConfigurationError, createLogger, getSources } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { getSourcesGeneration } from "@noverax/courier/internal";

import { type CheckedPolicy, MARKED_ONLY } from "../policy/checked-policy";
import { buildCatalog, type Catalog, type CatalogOptions } from "./catalog";

const log = createLogger("MCP");

/** Where a server's tools come from: the sources in force, and the catalog built from them. */
export interface ToolSource {
  /** The sources a tool's call runs against. */
  readonly sources: () => Sources;
  /** The tools, rebuilt when the registered sources are replaced. */
  readonly catalog: () => Catalog;
}

/** Which sources a tool source offers, by what policy, and how their schemas are written. */
export interface ToolSourceOptions extends Omit<CatalogOptions, "policy"> {
  /** The policy in force, read when the tools are built; the endpoints marked `.agent()` alone when absent. */
  readonly policy?: (() => CheckedPolicy) | undefined;
}

/**
 * The tools of the given sources, or of the ones the application
 * registered — read when a request needs them, and rebuilt when a dev
 * server registers them again after an edit, or the policy changes.
 *
 * Sources handed over are checked here, so a tool that cannot be offered
 * stops the application at its start rather than at an agent's first call.
 *
 * @param given - The sources, or `undefined` for the registered ones
 * @param options - Which of them, by what policy, and how their schemas are written
 * @returns The tool source
 * @throws ConfigurationError when given sources hold a tool that cannot be offered
 * @example
 * ```ts
 * const tools = toolSource({ shop }, {});
 * tools.catalog().tools.length;
 * ```
 */
export function toolSource(given: Sources | undefined, options: ToolSourceOptions): ToolSource {
  const policyOf = options.policy ?? (() => MARKED_ONLY);
  const warn = warnOnce();
  if (given !== undefined) {
    const catalog = warn(buildCatalog(given, { ...options, policy: policyOf() }));
    return { sources: () => given, catalog: () => catalog };
  }
  let built: { generation: number; policy: CheckedPolicy; catalog: Catalog } | undefined;
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
      const policy = policyOf();
      if (built?.generation !== generation || built.policy !== policy) {
        built = {
          generation,
          policy,
          catalog: warn(buildCatalog(sources(), { ...options, policy })),
        };
      }
      return built.catalog;
    },
  };
}

/* Each warning is logged when a catalog first brings it, not again on every rebuild that keeps it. */
function warnOnce(): (catalog: Catalog) => Catalog {
  let said = new Set<string>();
  return (catalog) => {
    for (const warning of catalog.warnings) if (!said.has(warning)) log.warn(warning);
    said = new Set(catalog.warnings);
    return catalog;
  };
}
