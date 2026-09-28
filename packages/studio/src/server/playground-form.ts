/** One field of a form the Playground sends: text, or a file's bytes. */
export type PlaygroundFormField =
  | { name: string; text: string }
  | { name: string; file: { name: string; type: string; data: Uint8Array | ArrayBuffer } };

/* Enough for any form a person fills in by hand. */
const MAX_FIELDS = 200;
const MAX_NAME = 256;

/**
 * Check the form a Playground call carries before it is passed to a runtime.
 *
 * Text fields hold strings, and a file field holds its name, its media type
 * and its bytes, which arrive as a binary attachment of the socket message.
 *
 * @param raw - The call's `form` field
 * @returns The fields; `undefined` when the call sends no form; `null` when
 *   the form is malformed and the call is refused
 * @example
 * ```ts
 * sanitizeForm([{ name: "note", text: "hi" }]); // → [{ name: "note", text: "hi" }]
 * ```
 */
export function sanitizeForm(raw: unknown): PlaygroundFormField[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_FIELDS) return null;
  const fields: PlaygroundFormField[] = [];
  for (const item of raw) {
    const field = fieldOf(item);
    if (!field) return null;
    fields.push(field);
  }
  return fields;
}

function fieldOf(item: unknown): PlaygroundFormField | undefined {
  if (!isRecord(item)) return undefined;
  const { name } = item;
  if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME) return undefined;
  if (typeof item.text === "string") return { name, text: item.text };
  const file = item.file;
  if (!isRecord(file) || typeof file.name !== "string" || typeof file.type !== "string") {
    return undefined;
  }
  const { data } = file;
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) return undefined;
  return { name, file: { name: file.name, type: file.type, data } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
