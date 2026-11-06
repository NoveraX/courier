import type { StudioHooks } from "../studio/hooks";
import { serverCapability } from "./registry";

/** What a call tells while Studio does not listen: no hook at all. */
export const NO_HOOKS: StudioHooks = Object.freeze({});

/**
 * The hooks Studio listens on, where a server attached Studio — none in a
 * page, which never has it, so a call there tells nothing.
 *
 * @returns The hooks Studio's runtime set, or none
 * @example
 * ```ts
 * studioHooksHere().onCacheMiss?.({ requestId, key, timestamp: Date.now() });
 * ```
 */
export function studioHooksHere(): StudioHooks {
  return serverCapability("studio")?.hooks ?? NO_HOOKS;
}
