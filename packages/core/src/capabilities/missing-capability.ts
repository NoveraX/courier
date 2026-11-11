import { capabilitySlots } from "./registry";

/* Every contract's key starts so: another one on the global object is another copy's registry. */
const KEY_PREFIX = "courier.serverCapabilities.";

/**
 * What else may keep a call from the server's part, beside nothing having
 * lent it: a registry of another contract on the global object, kept by a
 * copy of the core of another version, which this one does not read. That
 * copy makes its registry the first time it reads one, so the key may
 * hold no slot at all. This copy's registry is the one its slots are; a
 * module of its own, as only a call that asks for the server's part reads
 * it, and a page that makes only proxy calls takes none of it.
 *
 * @returns The cause, as a refusal adds it to its advice, or `undefined` where nothing more is known
 * @example
 * ```ts
 * const cause = missingCapabilityCause();
 * ```
 */
export function missingCapabilityCause(): string | undefined {
  const slots = capabilitySlots();
  const registries = Object.getOwnPropertySymbols(globalThis).flatMap((symbol) => {
    const key = Symbol.keyFor(symbol);
    return key?.startsWith(KEY_PREFIX)
      ? [{ key, own: Reflect.get(globalThis, symbol) === slots }]
      : [];
  });
  const own = registries.find((registry) => registry.own)?.key;
  const others = registries.filter((registry) => !registry.own).map((registry) => registry.key);
  if (others.length === 0) return undefined;
  return `this process runs another copy of the core too, under another contract: its registry is kept under ${others.join(", ")}, which this copy, under ${own}, does not read. Have one version of @noverax/courier installed, as npm ls @noverax/courier, pnpm why @noverax/courier or yarn why @noverax/courier shows`;
}
