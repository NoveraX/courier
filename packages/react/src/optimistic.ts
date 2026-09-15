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
  onError: (_err: HTTPError, _vars: MutationVars, onMutateResult: unknown) => void;
  onSettled: () => void;
} {
  return {
    onMutate: async (variables: MutationVars) => {
      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const previous = queryClient.getQueryData<CacheData>(config.queryKey);
      queryClient.setQueryData<CacheData>(config.queryKey, (old) => config.updater(old, variables));
      return { _previousData: previous };
    },
    onError: (_err: HTTPError, _vars: MutationVars, onMutateResult: unknown) => {
      const ctx = onMutateResult as OptimisticContext<CacheData> | undefined;
      if (ctx?._previousData !== undefined) {
        queryClient.setQueryData(config.queryKey, ctx._previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: config.queryKey });
    },
  };
}
