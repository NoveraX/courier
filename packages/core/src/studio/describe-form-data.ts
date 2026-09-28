/** A file in an upload, as Studio shows it. */
export interface DescribedFile {
  name: string;
  type: string;
  size: number;
}

type DescribedValue = string | DescribedFile;

/**
 * A `FormData` as Studio can show it: each field's text, and each file's
 * name, type and size in place of its bytes.
 *
 * Studio's events travel as JSON, which has no FormData, so an upload's
 * variables arrived there as `{}`. A field sent more than once becomes the
 * list of its values, in order.
 *
 * @param form - The upload's variables
 * @param omit - Fields to leave out, such as the proxy's own routing fields
 * @returns A plain object that survives JSON
 *
 * @example
 * ```ts
 * describeFormData(form); // → { title: "q3", report: { name: "q3.pdf", type: "application/pdf", size: 2048 } }
 * ```
 */
export function describeFormData(
  form: FormData,
  omit: ReadonlySet<string> = new Set(),
): Record<string, DescribedValue | DescribedValue[]> {
  const fields = new Map<string, DescribedValue | DescribedValue[]>();
  for (const [key, value] of form.entries()) {
    if (omit.has(key)) continue;
    const described: DescribedValue =
      typeof value === "string" ? value : { name: value.name, type: value.type, size: value.size };
    const previous = fields.get(key);
    if (previous === undefined) {
      fields.set(key, described);
    } else {
      fields.set(key, Array.isArray(previous) ? [...previous, described] : [previous, described]);
    }
  }
  /* `fromEntries` defines each field as an own property, so a field called
     `__proto__` stays a field. */
  return Object.fromEntries(fields);
}
