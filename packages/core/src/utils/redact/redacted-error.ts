import { REDACT_BOUNDS } from "./bounds";
import { redactedText } from "./redacted-text";
import { attempt, FAILED, UNREADABLE } from "./unreadable";

/* Where an error's stack leaves its message for the frames that say where it was thrown: the first
   line that starts, after its indent, with `at`, as V8 writes each frame. The indent stops at the
   line's end, so each line break is read on to its line's first word alone: a pattern that read on
   over line breaks would read the rest of a run of them from each, in time growing with the square
   of the run, and an error's message can quote what anyone sent. */
const FRAMES = /\n[^\S\n]+at\s/;
/* The fields of an error read by name, not copied as its own. */
const ERROR_FIELDS: ReadonlySet<string> = new Set(["name", "message", "stack", "cause", "errors"]);

/** Reads one part of an error: its cause or one of its errors, or one of its fields by name. */
export type ReadPart = (part: unknown, field?: string) => unknown;

/**
 * An error with what could be a credential cut out: the error itself where
 * nothing in it needed cutting, or a copy that prints as it does — its
 * name, its message and the message its stack starts with cut, the stack's
 * frames kept, its own fields and its causes read in turn. The copy is an
 * `Error`, or an `AggregateError` for one, whatever class the error was.
 *
 * @param error - The error
 * @param read - Reads its cause, its errors and its fields
 * @returns The error, or its copy
 */
export function redactedError(error: Error, read: ReadPart): Error {
  /* Each part read once and on its own: one whose getter throws is shown as unreadable. */
  const said = attempt(() => error.message);
  const text = said === FAILED ? FAILED : attempt(() => String(said));
  const message = text === FAILED ? UNREADABLE : redactedText(text);
  const trace = attempt(() => error.stack);
  const stack = typeof trace === "string" ? stackWithoutSecrets(trace) : undefined;
  const hasCause = attempt(() => "cause" in error) === true;
  const given = hasCause ? attempt(() => error.cause) : undefined;
  const cause = given === FAILED ? UNREADABLE : hasCause ? read(given) : undefined;
  const gathered = attempt(() => (isAggregate(error) ? error.errors : undefined));
  const errors = Array.isArray(gathered) ? readEach(gathered, read) : undefined;
  const names = attempt(() => Object.keys(error));
  const fields = (names === FAILED ? [] : names)
    .filter((field) => !ERROR_FIELDS.has(field))
    .map((field) => {
      const value = attempt(() => (error as unknown as Record<string, unknown>)[field]);
      return [field, value, value === FAILED ? UNREADABLE : read(value, field)] as const;
    });
  const unchanged =
    message === said &&
    stack === trace &&
    (!hasCause || cause === given) &&
    errors === gathered &&
    names !== FAILED &&
    fields.every(([, value, shown]) => shown === value);
  if (unchanged) return error;

  const options = hasCause ? { cause } : undefined;
  const copy = errors ? new AggregateError(errors, message, options) : new Error(message, options);
  const name = attempt(() => error.name);
  Object.defineProperty(copy, "name", {
    value: name === FAILED ? "Error" : name,
    configurable: true,
    writable: true,
  });
  if (stack !== undefined) copy.stack = stack;
  for (const [field, , shown] of fields) {
    /* Defined, not assigned: a field named `__proto__` would set the copy's prototype. */
    Object.defineProperty(copy, field, {
      value: shown,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

/**
 * Each item of a list read in turn: the list itself where none changed, or
 * a new one cut to the width read, the rest counted.
 *
 * @param list - The list
 * @param read - Reads one item
 * @returns The list, or the list as read
 */
export function readEach(
  list: readonly unknown[],
  read: (item: unknown) => unknown,
): readonly unknown[] {
  const kept = list.slice(0, REDACT_BOUNDS.width).map((item) => read(item));
  if (list.length > REDACT_BOUNDS.width) {
    return [...kept, `[… ${list.length - REDACT_BOUNDS.width} more]`];
  }
  return kept.every((item, at) => item === list[at]) ? list : kept;
}

function stackWithoutSecrets(stack: string): string {
  const at = stack.search(FRAMES);
  return at === -1 ? redactedText(stack) : `${redactedText(stack.slice(0, at))}${stack.slice(at)}`;
}

/* Not every runtime has AggregateError; one that has none throws none. */
function isAggregate(error: Error): error is AggregateError {
  return typeof AggregateError === "function" && error instanceof AggregateError;
}
