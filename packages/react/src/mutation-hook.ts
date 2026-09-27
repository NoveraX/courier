import type { HTTPError } from "@noverax/courier";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { GroupCall, HookOptions } from "./group-call";
import type { QueryGroupClient } from "./types";

/** The hook of a group that changes something on the server. */
export type MutationHook = Pick<
  // biome-ignore lint/suspicious/noExplicitAny: the implementation is untyped; QueryGroupClient<TGroup> types it for callers
  QueryGroupClient<any>,
  "useMutation"
>;

/**
 * Build the mutation hook of one group.
 *
 * @param call - The group's HTTP calls
 * @returns `useMutation`
 * @example
 * const { useMutation } = createMutationHook(createGroupCall("users", exec));
 */
export function createMutationHook(call: GroupCall): MutationHook {
  return {
    useMutation(method: string, options?: HookOptions) {
      const qc = useQueryClient();
      const {
        requestOptions,
        invalidate,
        onSettled: userOnSettled,
        ...mutationOptions
      } = options ?? {};

      return useMutation<unknown, HTTPError, unknown>({
        mutationFn: (variables: unknown) =>
          call.send(method, variables ?? undefined, requestOptions),
        ...mutationOptions,
        onSettled:
          invalidate || userOnSettled
            ? (...args: unknown[]) => {
                if (invalidate) {
                  for (const key of invalidate as QueryKey[]) {
                    qc.invalidateQueries({ queryKey: key });
                  }
                }
                (userOnSettled as ((...a: unknown[]) => void) | undefined)?.(...args);
              }
            : undefined,
      });
    },
  } as MutationHook;
}
