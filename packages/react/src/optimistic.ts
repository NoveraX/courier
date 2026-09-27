import type { HTTPError } from "@noverax/courier";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Optimistic update helper
// ---------------------------------------------------------------------------

export type OptimisticConfig<CacheData, MutationVars> = {
  queryKey: QueryKey;
  updater: (current: CacheData | undefined, variables: MutationVars) => CacheData;
};

interface OptimisticContext<CacheData> {
  _previousData: CacheData | undefined;
}

/**
 * Generates `onMutate` / `onError` / `onSettled` callbacks for optimistic
 * updates. Spread the result into mutation options.
 *
 * Compatible with TanStack Query v5+: the value returned by `onMutate` is
 * received by `onError` as the **third** argument (`onMutateResult`),
 * not as `context`. The fourth argument is the standard mutation context.
 *
 * A failure puts the cache back as it was — empty included: an entry the
 * optimistic update created is reset, so no component later renders the item
 * that failed. `onSettled` refetches the key and the mutation stays pending
 * until that refetch is done.
 *
 * @param queryClient - The client holding the cached data
 * @param config - The key to update and how the mutation's variables change it
 * @returns Callbacks to spread into `useMutation` options
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
  onMutate: (variables: MutationVars) => Promise<OptimisticContext<CacheData>>;
  onError: (_err: HTTPError, _vars: MutationVars, onMutateResult: unknown) => Promise<void>;
  onSettled: () => Promise<void>;
} {
  return {
    onMutate: async (variables: MutationVars) => {
      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const previous = queryClient.getQueryData<CacheData>(config.queryKey);
      queryClient.setQueryData<CacheData>(config.queryKey, (old) => config.updater(old, variables));
      return { _previousData: previous };
    },
    onError: async (_err: HTTPError, _vars: MutationVars, onMutateResult: unknown) => {
      if (!isOptimisticContext<CacheData>(onMutateResult)) return;
      if (onMutateResult._previousData === undefined) {
        await queryClient.resetQueries({ queryKey: config.queryKey, exact: true });
        return;
      }
      queryClient.setQueryData(config.queryKey, onMutateResult._previousData);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: config.queryKey }),
  };
}

function isOptimisticContext<CacheData>(value: unknown): value is OptimisticContext<CacheData> {
  return typeof value === "object" && value !== null && "_previousData" in value;
}
