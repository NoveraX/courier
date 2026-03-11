import type { HTTPError } from "@noverax/nexus";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Optimistic update helper
// ---------------------------------------------------------------------------

export type OptimisticConfig<CacheData, MutationVars> = {
  queryKey: QueryKey;
  updater: (current: CacheData | undefined, variables: MutationVars) => CacheData;
};

/**
 * Generates `onMutate` / `onError` / `onSettled` callbacks for optimistic updates.
 * Spread the result into mutation options.
 *
 * @example
 * ```ts
 * const qc = useQueryClient();
 * q.users.useMutation("create", {
 *   ...optimisticOptions(qc, {
 *     queryKey: key("users", "getAll"),
 *     updater: (old, vars) => [...(old ?? []), { ...vars, id: "temp" }],
 *   }),
 * });
 * ```
 */
export function optimisticOptions<CacheData, MutationVars>(
  queryClient: QueryClient,
  config: OptimisticConfig<CacheData, MutationVars>,
): {
  onMutate: (variables: MutationVars) => Promise<{ _previousData: CacheData | undefined }>;
  onError: (
    _err: HTTPError,
    _vars: MutationVars,
    context: { _previousData?: CacheData } | undefined,
  ) => void;
  onSettled: () => void;
} {
  return {
    onMutate: async (variables: MutationVars) => {
      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const previous = queryClient.getQueryData<CacheData>(config.queryKey);
      queryClient.setQueryData<CacheData>(config.queryKey, (old) => config.updater(old, variables));
      return { _previousData: previous };
    },
    onError: (
      _err: HTTPError,
      _vars: MutationVars,
      context: { _previousData?: CacheData } | undefined,
    ) => {
      if (context?._previousData !== undefined) {
        queryClient.setQueryData(config.queryKey, context._previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: config.queryKey });
    },
  };
}
