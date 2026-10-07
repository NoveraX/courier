import type { StandardSchemaV1 } from "@standard-schema/spec";

/** A value that passed its schema, as the schema returned it, or why it did not. */
export type Checked = { value: unknown } | { issues: readonly StandardSchemaV1.Issue[] };

/**
 * Check a value against a schema, as a Courier server checks a
 * subscription's variables and a channel's messages.
 *
 * @param schema - The schema; without one the value passes as it is
 * @param value - The value
 * @returns The value the schema produced, or its issues
 * @example
 * ```ts
 * await checkAgainst(z.object({ room: z.string() }), { room: 1 }); // → { issues: [...] }
 * ```
 */
export async function checkAgainst(
  schema: StandardSchemaV1 | undefined,
  value: unknown,
): Promise<Checked> {
  if (!schema) return { value };
  const result = await schema["~standard"].validate(value);
  return result.issues ? { issues: result.issues } : { value: result.value };
}
