/** One field of a form the Playground sends: text, or a file's bytes. */
export type PlaygroundFormField =
  | { name: string; text: string }
  | { name: string; file: { name: string; type: string; data: Uint8Array<ArrayBuffer> } };

/* Enough for any form a person fills in by hand. */
const MAX_FIELDS = 200;
const MAX_NAME = 256;

/**
 * Read the form a Playground call sends, as it arrived over the socket.
 *
 * A file's bytes arrive as a binary attachment: a `Buffer` in Node, an
 * `ArrayBuffer` elsewhere.
 *
 * @param raw - The call's `form` field
 * @returns The fields; `undefined` when the call sends no form; `null` when
 *   the form is malformed and the call is refused
 * @example
 * ```ts
 * readPlaygroundForm([{ name: "note", text: "hi" }]); // → [{ name: "note", text: "hi" }]
 * ```
 */
export function readPlaygroundForm(raw: unknown): PlaygroundFormField[] | null | undefined {
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

/**
 * The form as the endpoint takes it.
 *
 * @param fields - The form's fields, in order
 * @returns A `FormData` holding each text field and each file under its name
 * @example
 * ```ts
 * formDataOf([{ name: "file", file: { name: "a.txt", type: "text/plain", data: bytes } }]);
 * ```
 */
export function formDataOf(fields: readonly PlaygroundFormField[]): FormData {
  const form = new FormData();
  for (const field of fields) {
    if ("text" in field) form.append(field.name, field.text);
    else
      form.append(
        field.name,
        new Blob([field.file.data], { type: field.file.type }),
        field.file.name,
      );
  }
  return form;
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
  const data = bytesOf(file.data);
  return data ? { name, file: { name: file.name, type: file.type, data } } : undefined;
}

/* Copied, so the form owns bytes no socket buffer is reused for. */
function bytesOf(data: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) return new Uint8Array(data);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
