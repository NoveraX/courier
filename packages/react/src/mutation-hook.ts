import type { CallOptions } from "@noverax/courier";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { GroupCall } from "./group-call";
import type { UntypedGroupHooks } from "./untyped-group-hooks";

/** The hook of a group that changes something on the server. */
export type MutationHook = Pick<UntypedGroupHooks, "useMutation">;

type SuccessCallback = (...args: unknown[]) => unknown;

interface MutationHookOptions extends Record<string, unknown> {
  requestOptions?: CallOptions;
  invalidate?: QueryKey[];
  onSuccess?: SuccessCallback;
}

/**
 * Build the mutation hook of one group.
 *
 * `invalidate` refetches its queries once the mutation has succeeded, and
 * the mutation stays pending until they have: its caller sees the new data
 * the moment `mutateAsync` resolves, as with an `onSuccess` that returns
 * `invalidateQueries`. Every callback the caller passes, `onSettled`
 * included, reaches TanStack Query as it is, so a promise one returns is
 * awaited too.
 *
 * @param call - The group's HTTP calls
 * @returns `useMutation`
 * @example
 * const { useMutation } = createMutationHook(createGroupCall("users", exec));
 */
export function createMutationHook(call: GroupCall): MutationHook {
  return {
    useMutation(method: string, options?: MutationHookOptions) {
      const qc = useQueryClient();
      const { requestOptions, invalidate, onSuccess, ...mutationOptions } = options ?? {};

      return useMutation<unknown, Error, unknown>({
        mutationFn: (variables: unknown) =>
          call.send(method, variables ?? undefined, requestOptions),
        ...mutationOptions,
        onSuccess: invalidate ? withInvalidation(qc, invalidate, onSuccess) : onSuccess,
      });
    },
  } as MutationHook;
}

function withInvalidation(
  queryClient: QueryClient,
  keys: QueryKey[],
  onSuccess: SuccessCallback | undefined,
): SuccessCallback {
  return async (...args) => {
    await Promise.all([
      onSuccess?.(...args),
      ...keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ]);
  };
}
