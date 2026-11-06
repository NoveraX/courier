import { createLogger } from "../logger";
import { capabilitySlots, type ServerCapabilities, type ServerCapabilityName } from "./registry";

const log = createLogger("Server");

/**
 * Lend the calls of this process a server's implementation of one
 * capability. The first one provided stays: providing the same one again
 * changes nothing, and another one — a second copy of the core loaded
 * beside the first — is left out, so a module loaded later cannot take a
 * slot the server filled.
 *
 * @param name - The capability
 * @param capability - The server's implementation of it
 * @example
 * ```ts
 * provideServerCapability("inProcessProxy", { route: inProcessRoute });
 * ```
 */
export function provideServerCapability<TName extends ServerCapabilityName>(
  name: TName,
  capability: ServerCapabilities[TName],
): void {
  const held = capabilitySlots();
  const current = held[name];
  if (current === undefined) {
    held[name] = capability;
    return;
  }
  if (current !== capability) log.debug(`${name} was provided already; the first one stays`);
}

/**
 * Empty the slots named. Only test harnesses use it, to isolate one case's
 * server from the next one's; a server never needs it. Studio's slot is
 * filled as its hooks are made, once a run, so a harness names the slots
 * its cases fill.
 *
 * @param names - The slots to empty
 */
export function _resetServerCapabilitiesForTests(...names: ServerCapabilityName[]): void {
  const held = capabilitySlots();
  for (const name of names) Reflect.deleteProperty(held, name);
}
