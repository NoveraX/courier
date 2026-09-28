import type { ScannedSource } from "@/views/apis/types";
import type { BindingStatusRow, Catalog, CatalogEntry } from "@/store/types-ui";

/**
 * The sources the Playground offers: those a runtime can be asked to run.
 *
 * Studio routes a request by the source name it carries to the runtime that
 * hosts a source of that name, and runtimes host the sources of
 * `courier.config.ts` under the names the config gives them. So every
 * declared source is offered, and a source seen only in traffic is offered
 * only when a runtime hosts one by its name: the name traffic reports can
 * differ from the config's, and a request under it would reach no runtime.
 *
 * Each source offered carries the origin of the app that hosts it, which
 * the proxy path badge resolves a relative `proxyPath` against.
 *
 * @param catalog - Every source known, declared or seen
 * @param declared - The sources the config declares
 * @param rows - Which runtime hosts which source, as Studio last reported it
 * @returns The sources a request can be sent to
 *
 * @example
 * ```ts
 * const offered = sendableCatalog(catalog, scanSources, bindingSnapshot.rows);
 * Object.keys(offered); // → ["api"]
 * ```
 */
export function sendableCatalog(
  catalog: Catalog,
  declared: readonly ScannedSource[],
  rows: readonly BindingStatusRow[],
): Catalog {
  const declaredNames = new Set(declared.map((source) => source.name));
  const bound = rows.filter((row) => row.status === "bound");
  const boundNames = new Set(bound.map((row) => row.sourceName));
  return Object.fromEntries(
    Object.entries(catalog)
      .filter(([name]) => declaredNames.has(name) || boundNames.has(name))
      .map(([name, entry]) => [name, withAppOrigin(entry, appOriginOf(name, bound))]),
  );
}

/** The origin of the app hosting a source, the one hosting its HTTP calls first. */
function appOriginOf(name: string, bound: readonly BindingStatusRow[]): string | undefined {
  const rows = bound.filter((row) => row.sourceName === name && row.appOrigin);
  return (rows.find((row) => row.transport === "http") ?? rows[0])?.appOrigin;
}

function withAppOrigin(entry: CatalogEntry, appOrigin: string | undefined): CatalogEntry {
  if (!appOrigin || entry.appOrigin) return entry;
  return { ...entry, appOrigin };
}
