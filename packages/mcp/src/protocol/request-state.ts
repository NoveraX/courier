/** How long a confirmation a person was asked for stays good, in milliseconds. */
const LIFETIME = 5 * 60_000;
const VERSION = "v1";

/** What a sealed state binds a confirmation to: one tool, its exact arguments, a deadline. */
interface Sealed {
  readonly t: string;
  readonly a: string;
  readonly e: number;
}

/** Why a state a client echoed back was not taken. */
export type StateProblem = "forged" | "expired";

/** Seals the state a question for a person goes out with, and opens the one a client brings back. */
export interface RequestStates {
  /** The state for a question about this tool, called with these arguments. */
  seal(tool: string, args: unknown, now?: number): Promise<string>;
  /** Nothing when the state holds for this call; why not, when it does not. */
  open(
    state: unknown,
    tool: string,
    args: unknown,
    now?: number,
  ): Promise<StateProblem | undefined>;
}

/**
 * Seals and opens the `requestState` a server hands a client with a
 * question for a person, so the answer it brings back counts for the call it
 * was asked about alone: the same tool with the same arguments, within five
 * minutes. The state is signed (HMAC-SHA-256), as the protocol requires of a
 * state that decides whether a call runs; it is not single-use, which the
 * deadline bounds.
 *
 * @param secret - The signing key's bytes: one shared by every replica, or a random one per process
 * @returns The sealer
 * @example
 * ```ts
 * const states = requestStates(crypto.getRandomValues(new Uint8Array(32)));
 * const state = await states.seal("orders_cancel", { id: "7" });
 * await states.open(state, "orders_cancel", { id: "7" }); // undefined: it holds
 * ```
 */
export function requestStates(secret: Uint8Array): RequestStates {
  const key = crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return {
    async seal(tool: string, args: unknown, now = Date.now()): Promise<string> {
      const payload = base64url(
        new TextEncoder().encode(
          JSON.stringify({ t: tool, a: await digestOf(args), e: now + LIFETIME }),
        ),
      );
      return `${VERSION}.${payload}.${base64url(await sign(await key, payload))}`;
    },
    async open(
      state: unknown,
      tool: string,
      args: unknown,
      now = Date.now(),
    ): Promise<StateProblem | undefined> {
      const sealed = await verified(await key, state);
      if (sealed === undefined || sealed.t !== tool || sealed.a !== (await digestOf(args)))
        return "forged";
      return sealed.e < now ? "expired" : undefined;
    },
  };
}

async function verified(key: CryptoKey, state: unknown): Promise<Sealed | undefined> {
  if (typeof state !== "string") return undefined;
  const [version, payload, signature] = state.split(".");
  if (version !== VERSION || payload === undefined || signature === undefined) return undefined;
  const bytes = fromBase64url(signature);
  if (bytes === undefined) return undefined;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    bytes as BufferSource,
    new TextEncoder().encode(payload),
  );
  if (!valid) return undefined;
  /* Signed by this server, so it parses; a key shared with a server that signs other things is not. */
  try {
    const sealed: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return isSealed(sealed) ? sealed : undefined;
  } catch {
    return undefined;
  }
}

async function sign(key: CryptoKey, payload: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/* Keys sorted, so arguments a client rebuilt in another order are still the same arguments. */
async function digestOf(args: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(args)));
  return base64url(new Uint8Array(bytes));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value) ?? "null";
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, inner]) => inner !== undefined,
  );
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([name, inner]) => `${JSON.stringify(name)}:${canonical(inner)}`).join(",")}}`;
}

function isSealed(value: unknown): value is Sealed {
  if (typeof value !== "object" || value === null) return false;
  const { t, a, e } = value as Record<string, unknown>;
  return typeof t === "string" && typeof a === "string" && typeof e === "number";
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/* What a client sends back may be anything: a text that is no base64 is simply not a state. */
function fromBase64url(text: string): Uint8Array | undefined {
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}
