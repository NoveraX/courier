/* Methods that read: identical requests in flight may share one answer. QUERY sends its question as a body. */
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "QUERY"]);

const identities = new WeakMap<object, number>();

/**
 * Whether a request reads: as its endpoint declares it, or, unsaid, as its
 * method says — `GET`, `HEAD` and `QUERY` read.
 *
 * @param method - The request's method, as HTTP spells it
 * @param declared - Whether its endpoint is declared a read, when it is declared
 * @returns `true` for a read
 * @example
 * ```ts
 * isRead("POST", true); // a search sent as a POST → true
 * ```
 */
export function isRead(method: string, declared: boolean | undefined): boolean {
  return declared ?? READ_METHODS.has(method);
}
let lastIdentity = 0;

/**
 * What a request sends, written out so that two requests share a key only
 * when every part of them is the same: its method, its address, each of its
 * headers — credentials, the user's address, the request's id among them —
 * its body, and every option of how it goes, the `fetch` and the
 * connection it goes through by identity. Each part is written with its
 * length, so no body can read as another request's headers. A request that
 * sends more than a string has none, and never shares an answer.
 *
 * @param method - The request's method, as HTTP spells it
 * @param url - Its address, with its query
 * @param headers - Its headers
 * @param body - Its body
 * @param options - Every other option it is sent with
 * @returns The key, or `undefined` for a request that must go alone
 * @example
 * ```ts
 * flightKey("GET", "https://api.example.com/users?page=2", headers, null, { credentials: "include" });
 * ```
 */
export function flightKey(
  method: string,
  url: string,
  headers: Headers,
  body: unknown,
  options: Readonly<Record<string, unknown>>,
): string | undefined {
  if (body != null && typeof body !== "string") return undefined;
  const parts = [method, url, body ?? ""];
  headers.forEach((value, name) => {
    parts.push(`${name}:${value}`);
  });
  for (const name of Object.keys(options).sort()) parts.push(`${name}=${written(options[name])}`);
  return parts.map((part) => `${part.length}:${part}`).join("");
}

/* A value as a key compares it: a primitive by what it is, anything else by which one it is. */
function written(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object" || typeof value === "function") return `#${identityOf(value)}`;
  return `${typeof value}:${String(value)}`;
}

function identityOf(value: object): number {
  let identity = identities.get(value);
  if (identity === undefined) {
    lastIdentity += 1;
    identity = lastIdentity;
    identities.set(value, identity);
  }
  return identity;
}
