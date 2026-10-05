import type { ScannedSource } from "@/features/apis/types";
import { buildCatalogFromRequests } from "./build-catalog-from-requests";
import { buildCatalogFromScan } from "./build-catalog-from-scan";
import { mergeCatalogs } from "./merge-catalogs";
import type { RequestEntry } from "./types-request";
import type { Catalog } from "./types-ui";

/**
 * The catalogue of API sources the Explorer browses, the Playground sends to
 * and the audit scores.
 *
 * The sources `courier.config.ts` declares come first, as Studio read them:
 * each under the name the config gives it, which is the name a runtime
 * hosts it by, with its groups' prefixes and its endpoints' addresses. So
 * they are there before any request is made, and after a reload.
 *
 * Traffic adds what the config does not describe — an endpoint of a declared
 * source that was seen called, or a source seen only in traffic — and the
 * middleware that actually ran. An endpoint both declared and seen is
 * marked `both`.
 *
 * @param declared - The sources the config declares, as Studio sent them
 * @param requests - The requests seen this session
 * @returns Every source by name, with its groups and endpoints
 *
 * @example
 * ```ts
 * const catalog = buildCatalog(scanSources, requests);
 * catalog.api.groups.users.endpoints.byId.path; // → ":id"
 * ```
 */
export function buildCatalog(
  declared: readonly ScannedSource[],
  requests: readonly RequestEntry[],
): Catalog {
  return mergeCatalogs(buildCatalogFromScan(declared), buildCatalogFromRequests(requests));
}
