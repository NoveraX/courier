import { useMemo } from "react";

import type { ExplorerModel } from "@/features/explorer/explorer-model";
import { explorerModelOf } from "@/features/explorer/explorer-model";
import { useCatalogOf } from "@/hooks/use-catalog";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";

/* While calls keep coming, the model is rebuilt at most this often. */
const REBUILT_EVERY_MS = 1000;

/**
 * The Explorer's model — every source, group and endpoint the project
 * defines with this session's calls — rebuilt as requests arrive and every
 * few seconds, so "active now" lapses on its own. Under steady traffic the
 * requests change with every frame; rebuilt that often, the catalogue, the
 * model and the graph laid out from them kept a project of a thousand
 * endpoints busy most of the time, so they follow the requests at most
 * once a second.
 *
 * @returns The model
 * @example
 * ```ts
 * const model = useExplorerModel();
 * model.endpoints.length; // 25
 * ```
 */
export function useExplorerModel(): ExplorerModel {
  const requests = useThrottledValue(
    useStudioStore((s) => s.requests),
    REBUILT_EVERY_MS,
  );
  const catalog = useCatalogOf(requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const now = useNow();
  return useMemo(
    () => explorerModelOf(catalog, requests, now, slowMs),
    [catalog, requests, now, slowMs],
  );
}
