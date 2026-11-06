import type { ServerCapabilities, ServerCapabilityName, Slots } from "../../capabilities/registry";

/* What a page's own code provides, kept here rather than on the global object: a page reads none
   of it, and lends none of it to anything. */
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
 * Why a call that needs a server's part finds none: the code was built for
 * a page, which reads none.
 *
 * @returns The cause, as a refusal words it
 * @example
 * ```ts
 * missingCapabilityCause(); // → "this code was built for a page, …"
 * ```
 */
export function missingCapabilityCause(): string | undefined {
  return "this code was built for a page, which serves no request: it took Courier's modules for the browser, as a page's build does and as a test environment with the browser condition does, Jest's jsdom among them. Build server code for its server, and test it in a node environment";
}
