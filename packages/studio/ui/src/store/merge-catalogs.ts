import type { Catalog, CatalogEndpoint, CatalogEntry } from "./types-ui"
import { ownValue } from "@/lib/own-value"

/**
 * Merge the API the config declares with the endpoints traffic showed.
 *
 * A declared endpoint keeps its declared path, method and schemas, and
 * takes the middleware that actually ran when it was called. An endpoint
 * called but not declared — from a source Studio's config does not name —
 * is added as observed. Source names match whatever their letter case.
 *
 * @param declared - Built from `scan:sources`
 * @param observed - Built from the captured requests
 * @returns One catalog; neither input is changed
 *
 * @example
 * ```ts
 * const catalog = mergeCatalogs(buildCatalogFromScan(scanSources), buildCatalogFromRequests(requests))
 * ```
 */
export function mergeCatalogs(declared: Catalog, observed: Catalog): Catalog {
  const merged: Catalog = {}
  const declaredName = new Map<string, string>()
  for (const [name, entry] of Object.entries(declared)) {
    merged[name] = copyEntry(entry)
    declaredName.set(name.toLowerCase(), name)
  }
  for (const [name, entry] of Object.entries(observed)) {
    const target = declaredName.get(name.toLowerCase()) ?? name
    merged[target] = mergeEntry(ownValue(merged, target), entry)
  }
  return merged
}

function copyEntry(entry: CatalogEntry): CatalogEntry {
  const groups: CatalogEntry["groups"] = {}
  for (const [name, group] of Object.entries(entry.groups)) {
    groups[name] = { prefix: group.prefix, endpoints: { ...group.endpoints } }
  }
  return { ...entry, groups }
}

function mergeEntry(into: CatalogEntry | undefined, observed: CatalogEntry): CatalogEntry {
  if (!into) return copyEntry(observed)
  for (const [groupName, group] of Object.entries(observed.groups)) {
    const target = ownValue(into.groups, groupName) ?? { prefix: group.prefix, endpoints: {} }
    into.groups[groupName] = target
    for (const [method, endpoint] of Object.entries(group.endpoints)) {
      const known = ownValue(target.endpoints, method)
      target.endpoints[method] = known ? mergeEndpoint(known, endpoint) : endpoint
    }
  }
  return into
}

function mergeEndpoint(declared: CatalogEndpoint, observed: CatalogEndpoint): CatalogEndpoint {
  return {
    ...declared,
    origin: "both",
    ...(observed.middleware?.length && { middleware: observed.middleware }),
  }
}
