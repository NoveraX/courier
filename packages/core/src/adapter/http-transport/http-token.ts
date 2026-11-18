/* 64 bits tell a replica from any other there is; 128 make a key nobody guesses. */
const REPLICA_BYTES = 8;
const KEY_BYTES = 16;
const TOKEN = /^([0-9a-f]{16})\.[0-9a-f]{32}$/;

/**
 * A replica's name in the tokens of the connections it opens over HTTP:
 * random, so replicas started together never share one.
 *
 * @returns 16 hexadecimal digits
 * @example
 * ```ts
 * replicaName(); // "3f9c0a7d51e2b864"
 * ```
 */
export function replicaName(): string {
  return randomHex(REPLICA_BYTES);
}

/**
 * A new connection's token: the replica that holds the connection, and a
 * key of 128 random bits. It is the connection's: whoever holds it reads
 * and writes the connection, so it travels in request bodies and in the
 * connection's first answer, never in a URL or a header a log keeps.
 *
 * @param replica - The name of the replica that holds the connection
 * @returns The token
 * @example
 * ```ts
 * mintToken("3f9c0a7d51e2b864"); // "3f9c0a7d51e2b864.9b1d…"
 * ```
 */
export function mintToken(replica: string): string {
  return `${replica}.${randomHex(KEY_BYTES)}`;
}

/**
 * The replica a token names as the holder of its connection.
 *
 * @param token - A token a client sent
 * @returns The replica's name, or `undefined` for a token none mints
 * @example
 * ```ts
 * holderOf(mintToken("3f9c0a7d51e2b864")); // "3f9c0a7d51e2b864"
 * holderOf("forged"); // undefined
 * ```
 */
export function holderOf(token: string): string | undefined {
  return TOKEN.exec(token)?.[1];
}

function randomHex(bytes: number): string {
  let hex = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(bytes))) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
