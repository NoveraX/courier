import { isFormData } from "../utils/helpers";
import { isStreamedUpload } from "../utils/streamed-upload";

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
 * @returns A plain object that survives JSON
 *
 * @example
 * ```ts
 * describeFormData(form); // → { title: "q3", report: { name: "q3.pdf", type: "application/pdf", size: 2048 } }
 * ```
 */
export function describeFormData(
  form: FormData,
): Record<string, DescribedValue | DescribedValue[]> {
  const fields = new Map<string, DescribedValue | DescribedValue[]>();
  for (const [key, value] of form.entries()) {
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

/** An upload sent on as it arrives, as Studio shows it: by its media type alone. */
export interface DescribedStream {
  streamed: true;
  type: string;
}

/**
 * A call's variables as Studio can show them: a form field by field, as
 * `describeFormData` writes one; an upload sent on as it arrives by its
 * media type alone, since its bytes are the upstream's to read — kept out
 * of the event, the stream is not held by the events Studio keeps until it
 * connects; anything else as it is.
 *
 * @param variables - A call's variables
 * @returns What Studio is told of them
 *
 * @example
 * ```ts
 * describeVariables(upload); // → { streamed: true, type: "multipart/form-data" }
 * ```
 */
export function describeVariables(variables: unknown): unknown {
  if (isFormData(variables)) return describeFormData(variables);
  if (!isStreamedUpload(variables)) return variables;
  const end = variables.type.indexOf(";");
  const described: DescribedStream = {
    streamed: true,
    type: end === -1 ? variables.type : variables.type.slice(0, end),
  };
  return described;
}
