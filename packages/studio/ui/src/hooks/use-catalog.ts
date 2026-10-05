import { useMemo } from "react";

import { useStudioStore } from "@/store";
import { buildCatalog } from "@/store/build-catalog";
import type { RequestEntry } from "@/store/types-request";
import type { Catalog } from "@/store/types-ui";

/**
 * The catalogue of API sources: the ones `courier.config.ts` declares, with
 * what this session's traffic adds (see `buildCatalog`).
 *
 * @returns Every source by name, rebuilt when the config or the traffic changes
 *
 * @example
 * ```tsx
 * const catalog = useCatalog();
 * const sourceNames = Object.keys(catalog);
 * ```
 */
export function useCatalog(): Catalog {
  return useCatalogOf(useStudioStore((s) => s.requests));
}

/**
 * The catalogue with what the given requests add to the declared sources —
 * for a view that reads the requests less often than they change, so the
 * catalogue changes no more often than the requests it is given.
 *
 * @param requests - The requests whose traffic the catalogue adds
 * @returns Every source by name
 *
 * @example
 * ```tsx
 * const catalog = useCatalogOf(useThrottledValue(useStudioStore((s) => s.requests), 1_000));
 * ```
 */
export function useCatalogOf(requests: readonly RequestEntry[]): Catalog {
  const declared = useStudioStore((s) => s.scanSources);
  return useMemo(() => buildCatalog(declared, requests), [declared, requests]);
}
