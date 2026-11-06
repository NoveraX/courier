import { isReactNative } from "../utils/is-react-native";
import type { InProcessProxyCapability } from "./in-process-proxy";
import type { SessionCapability } from "./session";
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
  /** The user's session, read from the request being served, and the cookies its answers set carried on */
  readonly session: SessionCapability;
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
 * runs in a React Native app, which serves no request. A server reads its
 * slots whatever else its global object holds: one that put a DOM there
 * for a library is still a server. A page's bundle takes a stand-in of
 * this module, which reads no slot, so a script on the page cannot stand
 * in for a server and be handed the page's calls. That holds by the
 * `browser` condition a bundler builds a page with — Rollup's
 * `nodeResolve({ browser: true })`, esbuild's `platform: "browser"`: a page
 * built without it takes this module.
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
  if (isReactNative()) return undefined;
  return capabilitySlots()[name];
}

/* Every contract's key starts so: another one on the global object is another copy's registry. */
const KEY_PREFIX = "courier.serverCapabilities.";

/**
 * What else may keep a call from the server's part, beside nothing having
 * lent it: a registry of another contract on the global object, kept by a
 * copy of the core of another version, which this one does not read. That
 * copy makes its registry the first time it reads one, so the key may
 * hold no slot at all.
 *
 * @returns The cause, as a refusal adds it to its advice, or `undefined` where nothing more is known
 * @example
 * ```ts
 * const cause = missingCapabilityCause();
 * ```
 */
export function missingCapabilityCause(): string | undefined {
  const own = Symbol.keyFor(REGISTRY);
  const others = Object.getOwnPropertySymbols(globalThis)
    .map((symbol) => Symbol.keyFor(symbol))
    .filter((key) => key !== undefined && key !== own && key.startsWith(KEY_PREFIX));
  if (others.length === 0) return undefined;
  return `this process runs another copy of the core too, under another contract: its registry is kept under ${others.join(", ")}, which this copy, under ${own}, does not read. Have one version of @noverax/courier installed, as npm ls @noverax/courier, pnpm why @noverax/courier or yarn why @noverax/courier shows`;
}
