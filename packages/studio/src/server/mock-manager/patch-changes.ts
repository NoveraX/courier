import type { ServerState } from "./types";

/**
 * Whether a patch to what Studio holds of a mock changes any field of it, so
 * a page is sent the mock again only when there is something new to show.
 * A list or an object in the patch counts as new.
 *
 * @param state - What Studio holds of the mock
 * @param patch - The fields to set
 * @returns Whether any of them differs from the field it replaces
 * @example
 * ```ts
 * patchChanges(state, { pid: undefined, url: undefined }); // false once both are cleared
 * ```
 */
export function patchChanges(state: ServerState, patch: Partial<ServerState>): boolean {
  return Object.entries(patch).some(([key, value]) => {
    const current: unknown = Reflect.get(state, key);
    return current !== value;
  });
}
