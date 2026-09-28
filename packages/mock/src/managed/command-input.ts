/**
 * Readers for the fields of a command Studio sends a mock worker. A command
 * arrives over IPC as plain data, so each field is checked before it reaches
 * the store: a wrong one is refused with a message naming it, never cast and
 * used as though it were right.
 */

/** A command field that is missing or of the wrong kind */
export class CommandInputError extends Error {
  override readonly name = "CommandInputError";
}

/**
 * A field that names something — a collection, a scenario: a non-empty string.
 *
 * @param command - The command
 * @param field - The field to read
 * @returns The name
 * @example
 * ```ts
 * const collection = nameIn({ collection: "users" }, "collection"); // "users"
 * ```
 */
export function nameIn(command: Record<string, unknown>, field: string): string {
  const value = command[field];
  if (typeof value === "string" && value !== "") return value;
  throw new CommandInputError(`"${field}" must be a name, got ${describeValue(value)}`);
}

/**
 * A record id: a string or a number.
 *
 * @param command - The command
 * @param field - The field to read
 * @returns The id
 * @example
 * ```ts
 * idIn({ id: 7 }, "id"); // 7
 * ```
 */
export function idIn(command: Record<string, unknown>, field: string): string | number {
  const value = command[field];
  if (typeof value === "string" || typeof value === "number") return value;
  throw new CommandInputError(`"${field}" must be a record id, got ${describeValue(value)}`);
}

/**
 * A plain object — a record to create, the fields to update.
 *
 * @param command - The command
 * @param field - The field to read
 * @returns The object
 * @example
 * ```ts
 * objectIn({ record: { name: "Ada" } }, "record"); // { name: "Ada" }
 * ```
 */
export function objectIn(command: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = command[field];
  if (isPlainObject(value)) return value;
  throw new CommandInputError(`"${field}" must be an object, got ${describeValue(value)}`);
}

/**
 * An optional count of records: a whole number from 0 up, or nothing.
 *
 * @param command - The command
 * @param field - The field to read
 * @returns The count, or `undefined` when the command gives none
 * @example
 * ```ts
 * countIn({ count: 5 }, "count"); // 5
 * countIn({}, "count"); // undefined
 * ```
 */
export function countIn(command: Record<string, unknown>, field: string): number | undefined {
  const value = command[field];
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw new CommandInputError(
    `"${field}" must be a whole number of records, got ${describeValue(value)}`,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === undefined) return "nothing";
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || Array.isArray(value)) return value === null ? "null" : "an array";
  return typeof value === "object" ? "an object" : String(value);
}
