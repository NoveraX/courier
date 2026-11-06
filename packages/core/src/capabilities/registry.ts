import { servesOneUser } from "../utils/serves-one-user";
import type { InProcessProxyCapability } from "./in-process-proxy";
import type { StudioCapability } from "./studio";

/**
 * What a server lends the calls made in its process, one slot each: the
 * server's own implementation of something a call's code only describes.
 * A page's code reaches a server's code through these alone — it imports
 * none of it — so what a page bundles is what a page runs.
 */
export interface ServerCapabilities {
  /** The proxy of this process, which a proxy caller on its server reaches without leaving it */
  readonly inProcessProxy: InProcessProxyCapability;
  /** Studio's view of the calls, where Studio is attached */
  readonly studio: StudioCapability;
}

/** The name of one slot of {@link ServerCapabilities}. */
export type ServerCapabilityName = keyof ServerCapabilities;

export type Slots = { -readonly [TName in ServerCapabilityName]?: ServerCapabilities[TName] };

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

/**
 * The slots of the process, made the first time anything reads or fills one.
 *
 * @returns The slots
 * @example
 * ```ts
 * capabilitySlots().session;
 * ```
 */
export function capabilitySlots(): Slots {
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
  return capabilitySlots()[name];
}
