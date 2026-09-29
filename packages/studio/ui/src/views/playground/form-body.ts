import { formatSize } from "@/components/shared/formatters";

/** A row of the Playground's form body: a named text value, or a named file */
export interface FormBodyField {
  id: string;
  name: string;
  kind: "text" | "file";
  text: string;
  file: File | null;
}

/** A form field as it travels to the runtime; a file's bytes go as a binary attachment */
export type WireFormField =
  | { name: string; text: string }
  | { name: string; file: { name: string; type: string; data: ArrayBuffer } };

let nextId = 0;

/**
 * A new, empty row of the form.
 *
 * @param kind - Whether the row holds text or a file
 * @returns The row
 *
 * @example
 * ```ts
 * setFields([...fields, emptyField("file")]);
 * ```
 */
export function emptyField(kind: FormBodyField["kind"] = "text"): FormBodyField {
  nextId += 1;
  return { id: `field-${nextId}`, name: "", kind, text: "", file: null };
}

/**
 * The form as the runtime rebuilds it: every named row, in order, a file row
 * only once a file is chosen.
 *
 * @param fields - The rows
 * @returns The fields to send
 *
 * @example
 * ```ts
 * socket.emit("playground:exec", { ...call, form: await wireForm(fields) });
 * ```
 */
export async function wireForm(fields: readonly FormBodyField[]): Promise<WireFormField[]> {
  const sent = fields.filter((field) => field.name.trim() !== "");
  return Promise.all(
    sent.flatMap((field): Array<Promise<WireFormField>> => {
      const name = field.name.trim();
      if (field.kind === "text") return [Promise.resolve({ name, text: field.text })];
      const { file } = field;
      if (!file) return [];
      return [
        file
          .arrayBuffer()
          .then((data) => ({ name, file: { name: file.name, type: file.type, data } })),
      ];
    }),
  );
}

/**
 * The form as the Playground's history shows it: each field's text, or its
 * file's name and size.
 *
 * @param fields - The rows
 * @returns A JSON description of the form
 *
 * @example
 * ```ts
 * describeForm(fields); // '{\n  "note": "hi",\n  "file": "photo.png (2.1 KB)"\n}'
 * ```
 */
export function describeForm(fields: readonly FormBodyField[]): string {
  const described = new Map<string, string>();
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    if (field.kind === "text") described.set(name, field.text);
    else if (field.file) described.set(name, `${field.file.name} (${formatSize(field.file.size)})`);
  }
  return JSON.stringify(Object.fromEntries(described), null, 2);
}
