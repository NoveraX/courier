import { useMemo } from "react";

import type { ExplorerModel } from "@/features/explorer/explorer-model";
import { explorerModelOf } from "@/features/explorer/explorer-model";
import { useCatalog } from "@/hooks/use-catalog";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";

/**
 * The Explorer's model — every source, group and endpoint the project
 * defines with this session's calls — rebuilt as requests arrive and every
 * few seconds, so "active now" lapses on its own.
 *
 * @returns The model
 * @example
 * ```ts
 * const model = useExplorerModel();
 * model.endpoints.length; // 25
 * ```
 */
export function useExplorerModel(): ExplorerModel {
  const catalog = useCatalog();
  const requests = useStudioStore((s) => s.requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  return useMemo(
    () => explorerModelOf(catalog, requests, now, slowMs),
    [catalog, requests, now, slowMs],
  );
}
