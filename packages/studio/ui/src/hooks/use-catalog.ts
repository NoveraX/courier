import { useMemo } from "react";

import { useStudioStore } from "@/store";
import { buildCatalog } from "@/store/build-catalog";
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
  const declared = useStudioStore((s) => s.scanSources);
  const requests = useStudioStore((s) => s.requests);
  return useMemo(() => buildCatalog(declared, requests), [declared, requests]);
}
