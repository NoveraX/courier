import { createLogger } from "../logger";
import { servesOneUser } from "../utils/serves-one-user";
import type { InProcessProxyCapability } from "./in-process-proxy";

const log = createLogger("Server");

/**
 * What a server lends the calls made in its process, one slot each: the
 * server's own implementation of something a call's code only describes.
 * A page's code reaches a server's code through these alone — it imports
 * none of it — so what a page bundles is what a page runs.
 */
export interface ServerCapabilities {
  /** The proxy of this process, which a proxy caller on its server reaches without leaving it */
  readonly inProcessProxy: InProcessProxyCapability;
}

/** The name of one slot of {@link ServerCapabilities}. */
export type ServerCapabilityName = keyof ServerCapabilities;

type Slots = { -readonly [TName in ServerCapabilityName]?: ServerCapabilities[TName] };

/* Kept on the global object, as the sources are: a bundler may load the core
   twice in one process — a Next.js application's routes and its
   instrumentation, a Nuxt page's copy beside the server's — and a call one
   copy makes must find what the other's server provided. The version of the
   slots' contract is in the key: a copy whose slots take other arguments
   keeps a registry of its own rather than calling one it does not know. */
const REGISTRY = Symbol.for("courier.serverCapabilities.v1");

function isSlots(value: unknown): value is Slots {
  return typeof value === "object" && value !== null;
}

function slots(): Slots {
  const existing: unknown = Reflect.get(globalThis, REGISTRY);
  if (isSlots(existing)) return existing;
  const created: Slots = {};
  Reflect.set(globalThis, REGISTRY, created);
  return created;
}

/**
 * The server's implementation of one capability, as the server that runs
 * this code provided it — or `undefined`: nothing provided it, or the code
 * runs in a page or an app. A page asks nothing of the registry whatever
 * lies on its global object, so a script on the page cannot stand in for a
 * server and be handed the page's calls.
 *
 * @param name - The capability
 * @returns Its implementation, or `undefined`
 * @example
 * ```ts
 * const route = serverCapability("inProcessProxy")?.route(proxyPath, "api");
 * ```
 */
export function serverCapability<TName extends ServerCapabilityName>(
  name: TName,
): ServerCapabilities[TName] | undefined {
  if (servesOneUser()) return undefined;
  return slots()[name];
}

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
  const held = slots();
  const current = held[name];
  if (current === undefined) {
    held[name] = capability;
    return;
  }
  if (current !== capability) log.debug(`${name} was provided already; the first one stays`);
}

/**
 * Empty every slot again. Only test harnesses use it, to isolate one
 * case's server from the next one's; a server never needs it.
 */
export function _resetServerCapabilitiesForTests(): void {
  Reflect.deleteProperty(globalThis, REGISTRY);
}
