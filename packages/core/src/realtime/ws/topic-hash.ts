/**
 * Deterministic hash for WS topic qualification.
 * Produces a short hex suffix from variables for topic uniqueness.
 *
 * Both ends hash the variables as the subscribe frame carries them — JSON.
 * The client used to hash the object it was handed, so a key set to
 * `undefined` (which JSON leaves out) or a `Date` (which JSON turns into a
 * string) gave it a topic the server never used, and the subscription
 * received nothing.
 */

/** The variables as they travel: what JSON keeps of them, `undefined` when nothing. */
function wireForm(value: unknown): unknown {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  return json === undefined ? undefined : (JSON.parse(json) as unknown);
}

/**
 * Canonical JSON: object keys sorted so the same variables always read the
 * same, and strings quoted so that no value can pass for a key and another
 * value — `{ a: "x,b:y" }` used to read like `{ a: "x", b: "y" }`.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${fields.join(",")}}`;
}

/** FNV-1a 32-bit hash -> 8-char hex string */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Compute a deterministic hash of variables, as they travel on the wire.
 *
 * @param variables - Subscription variables
 * @returns An 8-character hex hash
 *
 * @example
 * hashVariables({ room: "a", nick: undefined }) === hashVariables({ room: "a" }); // true
 */
export function hashVariables(variables: unknown): string {
  return fnv1a(stableStringify(wireForm(variables) ?? null));
}

/**
 * Qualify a base topic with a variables hash suffix.
 * Returns `baseTopic` when the variables carry nothing on the wire — none,
 * `null`, or an empty object once undefined fields are left out — and
 * `baseTopic#hash` otherwise.
 *
 * @param baseTopic - The unqualified topic, e.g. `"api.chat.room"`
 * @param variables - Subscription variables
 * @returns The qualified topic
 *
 * @example
 * qualifyTopic("api.chat.room", { room: "a" }); // "api.chat.room#…"
 * qualifyTopic("api.chat.room", { nick: undefined }); // "api.chat.room"
 */
export function qualifyTopic(baseTopic: string, variables?: unknown): string {
  const wire = wireForm(variables);
  if (wire === undefined || wire === null) return baseTopic;
  if (typeof wire === "object" && Object.keys(wire).length === 0) return baseTopic;
  return `${baseTopic}#${fnv1a(stableStringify(wire))}`;
}

/** Extract base topic and optional hash from a qualified topic */
export function unqualifyTopic(qualifiedTopic: string): { baseTopic: string; hash?: string } {
  const idx = qualifiedTopic.indexOf("#");
  if (idx === -1) return { baseTopic: qualifiedTopic };
  return { baseTopic: qualifiedTopic.slice(0, idx), hash: qualifiedTopic.slice(idx + 1) };
}
