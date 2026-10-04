/**
 * The key that qualifies a WS topic: the variables, as canonical JSON.
 *
 * Both ends key the variables as the subscribe frame carries them — JSON.
 * A key set to `undefined` (which JSON leaves out) or a `Date` (which JSON
 * turns into a string) reads the same on either side.
 *
 * The canonical JSON itself is the key, not a hash of it: it tells every set
 * of variables apart, so no subscriber can pick variables its own
 * authorization allows that collide with another room's, and it is no longer
 * than the subscribe frame that carried it.
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
 * value — `{ a: "x,b:y" }` never reads like `{ a: "x", b: "y" }`.
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

/**
 * Qualify a base topic with the key of its variables.
 * Returns `baseTopic` when the variables carry nothing on the wire — none,
 * `null`, or an empty object once undefined fields are left out — and
 * `baseTopic#key` otherwise, where the key is the variables' canonical JSON.
 *
 * @param baseTopic - The unqualified topic, e.g. `"api.chat.room"`
 * @param variables - Subscription variables
 * @returns The qualified topic
 *
 * @example
 * qualifyTopic("api.chat.room", { room: "a", nick: undefined }); // 'api.chat.room#{"room":"a"}'
 * qualifyTopic("api.chat.room", { nick: undefined }); // "api.chat.room"
 */
export function qualifyTopic(baseTopic: string, variables?: unknown): string {
  const wire = wireForm(variables);
  if (wire === undefined || wire === null) return baseTopic;
  if (typeof wire === "object" && Object.keys(wire).length === 0) return baseTopic;
  return `${baseTopic}#${stableStringify(wire)}`;
}

/**
 * Split a qualified topic into its base topic and the key that qualifies it.
 *
 * @param qualifiedTopic - A topic as `qualifyTopic` produced it
 * @returns The base topic, and the key when there is one
 *
 * @example
 * unqualifyTopic('api.chat.room#{"room":"a"}'); // { baseTopic: "api.chat.room", key: '{"room":"a"}' }
 */
export function unqualifyTopic(qualifiedTopic: string): { baseTopic: string; key?: string } {
  const idx = qualifiedTopic.indexOf("#");
  if (idx === -1) return { baseTopic: qualifiedTopic };
  return { baseTopic: qualifiedTopic.slice(0, idx), key: qualifiedTopic.slice(idx + 1) };
}
