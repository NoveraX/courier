import type { StudioHooks } from "../studio/hooks";
import { studioCapability } from "./registry";

/** What a call tells while Studio does not listen: no hook at all. */
export const NO_HOOKS: StudioHooks = Object.freeze({});

/**
 * The hooks Studio listens on, where Studio's runtime attached — a
 * server's, or a page's whose bundle runs it — and none elsewhere, so a
 * call there tells nothing.
 *
 * @returns The hooks Studio's runtime set, or none
 * @example
 * ```ts
 * studioHooksHere().onCacheMiss?.({ requestId, key, timestamp: Date.now() });
 * ```
 */
export function studioHooksHere(): StudioHooks {
  return studioCapability()?.hooks ?? NO_HOOKS;
}
