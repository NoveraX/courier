/** A thrown value as a JSON log line carries it. */
export type SerializedCause = string | number | boolean | SerializedError | Record<string, unknown>;

/** An error as a JSON log line carries it: what the console prints of it. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  /** Its own fields that are plain values: `code`, `errno`, `syscall`, `port`, `status`. */
  [field: string]: unknown;
  cause?: SerializedCause;
  /** An AggregateError's errors. */
  errors?: SerializedCause[];
}

/* Deeper than any chain a program builds on purpose; a deeper one is cut. */
const MAX_DEPTH = 16;
const RESERVED = new Set(["name", "message", "stack", "cause", "errors"]);

function plainValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  return typeof value === "bigint" ? value.toString() : undefined;
}

/* A value that is not an error goes in as it is where it is JSON, else as
   its string form — a cycle, a BigInt inside, a class with no fields. */
function otherValue(value: unknown): SerializedCause {
  const plain = plainValue(value);
  if (plain !== undefined) return plain;
  try {
    const text = JSON.stringify(value);
    if (text !== undefined && text !== "{}") return { value };
  } catch {
    /* Not JSON; its string form is the record. */
  }
  return String(value);
}

/**
 * A thrown value as a JSON log line carries it: an error's name, message,
 * stack, plain fields such as `code`, its `cause` chain and an
 * AggregateError's errors; anything else as JSON or as its string form. A
 * chain that loops ends where it repeats; one deeper than sixteen is cut.
 *
 * @param cause - What was thrown
 * @param seen - The errors above it in the chain
 * @returns A value `JSON.stringify` writes without throwing
 * @example
 * ```ts
 * JSON.stringify({ error: serializeError(new Error("disk full", { cause: err })) });
 * ```
 */
export function serializeError(
  cause: unknown,
  seen: ReadonlySet<Error> = new Set(),
): SerializedCause {
  if (!(cause instanceof Error)) return otherValue(cause);
  if (seen.has(cause) || seen.size >= MAX_DEPTH) return `${cause.name}: ${cause.message}`;
  const below = new Set(seen).add(cause);
  const record: SerializedError = { name: cause.name, message: cause.message };
  const fields: Record<string, unknown> = { ...cause };
  for (const [field, value] of Object.entries(fields)) {
    const plain = RESERVED.has(field) ? undefined : plainValue(value);
    if (plain !== undefined) record[field] = plain;
  }
  if (cause.stack !== undefined) record.stack = cause.stack;
  if (cause.cause !== undefined) record.cause = serializeError(cause.cause, below);
  if (cause instanceof AggregateError) {
    record.errors = cause.errors.map((error: unknown) => serializeError(error, below));
  }
  return record;
}
