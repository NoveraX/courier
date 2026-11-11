import type { ServerCapabilities, ServerCapabilityName, Slots } from "../../capabilities/registry";
import type { StudioCapability } from "../../capabilities/studio";

/* What a page's own code provides, kept here rather than on the global object: a page reads none
   of it but Studio's view, which Studio's runtime lends where it runs in the page's bundle, and
   lends none of it to anything. */
const slots: Slots = {};

/**
 * The slots, as a page's bundle has them: its own, never the global
 * object's, so nothing a script puts there reaches a page's calls.
 *
 * @returns The slots
 * @example
 * ```ts
 * capabilitySlots().session;
 * ```
 */
export function capabilitySlots(): Slots {
  return slots;
}

/**
 * The server's implementation of a capability, as a page's bundle has it:
 * none, whatever lies on the page's global object. A page serves no
 * request, so a script on it cannot stand in for a server and be handed
 * the page's calls. A bundler that builds for the browser takes this
 * module in place of the one that reads a server's slots.
 *
 * @param _name - The capability
 * @returns Nothing
 * @example
 * ```ts
 * serverCapability("session"); // → undefined
 * ```
 */
export function serverCapability<TName extends ServerCapabilityName>(
  _name: TName,
): ServerCapabilities[TName] | undefined {
  return undefined;
}

/**
 * Studio's view of a page's calls, as a page's bundle has it: what
 * Studio's runtime lent the page's own slot as it set its hooks, where
 * that runtime runs in the bundle. Nothing outside the bundle reaches the
 * slot, and no server's part comes with it.
 *
 * @returns Studio's view, or `undefined` where its runtime is not attached
 * @example
 * ```ts
 * studioCapability()?.hooks.onProxyClientTiming?.(timing);
 * ```
 */
export function studioCapability(): StudioCapability | undefined {
  return slots.studio;
}
