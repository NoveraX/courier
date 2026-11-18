/* 64 bits tell a replica from any other there is; 128 make a key nobody guesses, and a MAC
   nobody forges. */
const REPLICA_BYTES = 8;
const KEY_BYTES = 16;
const MAC_BYTES = 16;
const UNSIGNED = /^([0-9a-f]{16})\.[0-9a-f]{32}$/;
const SIGNED = /^(([0-9a-f]{16})\.[0-9a-f]{32})\.([0-9a-f]{32})$/;
/* What a token's MAC is taken over begins with this, so no other message the secret signs is one. */
const MAC_CONTEXT = "courier:ws:http:token:";

const encoder = new TextEncoder();

/** The tokens of the connections one replica holds over HTTP. */
export interface Tokens {
  /** The replica's name, which its tokens carry: random, so replicas started together never share one */
  readonly replica: string;
  /** A new connection's token */
  mint(): Promise<string>;
  /**
   * The replica a token names as its connection's holder, once it is one a
   * replica of the cluster could have minted; `undefined` for any other
   */
  holderOf(token: string): Promise<string | undefined>;
}

/**
 * The tokens of one replica's connections over HTTP: its name and a key of
 * 128 random bits. A token is its connection's — whoever holds it reads and
 * writes the connection — so it travels in request bodies and in the
 * connection's first answer, never in a URL or a header a log keeps. With
 * the cluster's secret, a MAC of 128 bits follows, so a replica that holds
 * no connection for a token tells a forged one without asking the replica
 * it names.
 *
 * @param secret - The cluster's secret, when it has one
 * @returns The replica's tokens
 * @example
 * ```ts
 * const tokens = createTokens(secret);
 * const token = await tokens.mint(); // "3f9c0a7d51e2b864.9b1d…"
 * await tokens.holderOf(token); // "3f9c0a7d51e2b864"
 * ```
 */
export function createTokens(secret: string | undefined): Tokens {
  const replica = randomHex(REPLICA_BYTES);
  if (secret === undefined) {
    return {
      replica,
      mint: async () => `${replica}.${randomHex(KEY_BYTES)}`,
      holderOf: async (token) => UNSIGNED.exec(token)?.[1],
    };
  }
  const key = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  async function macOf(named: string): Promise<string> {
    const digest = await crypto.subtle.sign("HMAC", await key, encoder.encode(MAC_CONTEXT + named));
    return hexOf(new Uint8Array(digest, 0, MAC_BYTES));
  }
  return {
    replica,
    async mint() {
      const named = `${replica}.${randomHex(KEY_BYTES)}`;
      return `${named}.${await macOf(named)}`;
    },
    async holderOf(token) {
      const [, named, holder, mac] = SIGNED.exec(token) ?? [];
      if (named === undefined || mac === undefined) return undefined;
      return sameText(mac, await macOf(named)) ? holder : undefined;
    },
  };
}

/* Compared whole, whichever character differs: the time a check takes tells nothing of the MAC. */
function sameText(a: string, b: string): boolean {
  let differs = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) differs |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differs === 0;
}

function randomHex(bytes: number): string {
  return hexOf(crypto.getRandomValues(new Uint8Array(bytes)));
}

function hexOf(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
