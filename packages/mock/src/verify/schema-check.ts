import { standardJsonSchema } from "@noverax/courier/internal";
import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { SchemaIssue } from "./types";

const ROOT = "(root)";

/**
 * The places a schema refuses a value at, each with what it says of it.
 *
 * @param schema - The schema
 * @param value - The value recorded
 * @returns Its issues; none while it passes
 * @example
 * ```ts
 * await schemaIssues(z.object({ id: z.string() }), { id: 1 }); // → [{ path: "id", message: "…" }]
 * ```
 */
export async function schemaIssues(
  schema: StandardSchemaV1,
  value: unknown,
): Promise<SchemaIssue[]> {
  const result = await schema["~standard"].validate(value);
  if (!result.issues) return [];
  return result.issues.map((issue) => ({
    path: pathOf(issue.path),
    message: issue.message,
  }));
}

/**
 * The issues outside the places a recording's secrets were replaced at: a
 * schema refuses `[redacted]` where it wants a UUID, which says nothing of
 * what the call sent.
 *
 * @param issues - The schema's issues with a part of the recording
 * @param part - The part: `variables` or `response`
 * @param redacted - The recording's replaced places, such as `variables.password`
 * @returns The issues that stand
 * @example
 * ```ts
 * outsideRedacted([{ path: "token", message: "…" }], "response", ["response.token"]); // → []
 * ```
 */
export function outsideRedacted(
  issues: readonly SchemaIssue[],
  part: "variables" | "response",
  redacted: readonly string[] = [],
): SchemaIssue[] {
  const places = redacted
    .filter((place) => place.startsWith(`${part}.`) || place.startsWith(`${part}[`))
    .map((place) => place.slice(part.length).replace(/^\./, ""));
  return issues.filter(
    (issue) =>
      !places.some(
        (place) =>
          issue.path === place ||
          issue.path.startsWith(`${place}.`) ||
          issue.path.startsWith(`${place}[`),
      ),
  );
}

/**
 * Whether a schema reshapes what it reads — a transform, a pipe into
 * another type — so the value it answers with is not the value it was
 * given: what its JSON Schema lets a value be differs between what it takes
 * and what it gives, or one of them cannot be written. A default, an
 * optional field and an object closed on the way out reshape nothing; a
 * schema whose library describes neither side is taken to read values as
 * they are.
 *
 * @param schema - The schema
 * @returns Whether it reshapes
 * @example
 * ```ts
 * reshapes(z.string().transform(Number)); // → true
 * ```
 */
export function reshapes(schema: StandardSchemaV1): boolean {
  const input = standardJsonSchema(schema, "input");
  const output = standardJsonSchema(schema, "output");
  if (input === undefined && output === undefined) return false;
  return JSON.stringify(typesOf(input)) !== JSON.stringify(typesOf(output));
}

/* What a value may be, without what only tells the two sides apart: the output
   closes objects and requires a default's field, neither of which reshapes. */
const SIDE_ONLY: ReadonlySet<string> = new Set(["additionalProperties", "required", "default"]);

function typesOf(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(typesOf);
  if (typeof schema !== "object" || schema === null) return schema;
  const entries: Array<[string, unknown]> = Object.entries(schema);
  return Object.fromEntries(
    entries.filter(([key]) => !SIDE_ONLY.has(key)).map(([key, value]) => [key, typesOf(value)]),
  );
}

function pathOf(path: StandardSchemaV1.Issue["path"]): string {
  if (!path || path.length === 0) return ROOT;
  let written = "";
  for (const segment of path) {
    const key = typeof segment === "object" && segment !== null ? segment.key : segment;
    written += typeof key === "number" ? `[${key}]` : `${written === "" ? "" : "."}${String(key)}`;
  }
  return written;
}
