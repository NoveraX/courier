/** A file a request sent, as Studio shows it: its name, type and size. */
export interface DescribedFile {
  name: string;
  type: string;
  size: number;
}

/* Narrowed to unknown items: `Array.isArray` alone types them `any`. */
function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function described(value: unknown): unknown {
  if (value instanceof File) return { name: value.name, type: value.type, size: value.size };
  if (value instanceof Blob) return { name: "", type: value.type, size: value.size };
  return value;
}

/**
 * A request's variables as Studio and the admin API show them: each file a
 * form sent as its name, type and size — a file has no JSON, and showed as
 * `{}` — every other field as it is, and a file sent as the whole body as
 * its own description.
 *
 * @param variables - The variables the mock read
 * @returns The variables to show
 * @example
 * ```ts
 * describedUploads({ title: "Q3", file: new File(["…"], "q3.pdf") });
 * // → { title: "Q3", file: { name: "q3.pdf", type: "", size: 3 } }
 * describedUploads(new Blob(["%PDF"], { type: "application/pdf" }));
 * // → { name: "", type: "application/pdf", size: 4 }
 * ```
 */
export function describedUploads(variables: unknown): unknown {
  if (variables instanceof Blob) return described(variables);
  if (typeof variables !== "object" || variables === null || Array.isArray(variables)) {
    return variables;
  }
  const fields: Array<[string, unknown]> = Object.entries(variables);
  const holdsFiles = fields.some(([, value]) =>
    isList(value) ? value.some((item) => item instanceof Blob) : value instanceof Blob,
  );
  if (!holdsFiles) return variables;
  return Object.fromEntries(
    fields.map(([key, value]) => [key, isList(value) ? value.map(described) : described(value)]),
  );
}
