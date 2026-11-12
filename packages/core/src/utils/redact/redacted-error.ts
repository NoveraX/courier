import { REDACT_BOUNDS } from "./bounds";
import { redactedText } from "./redacted-text";
import { attempt, FAILED, UNREADABLE } from "./unreadable";

/* One frame of a stack as an engine writes each after the error's header: a line that starts,
   after its indent, with `at`. Each is read from where the one before ended, so a stack is read
   once, whatever runs of line breaks or spaces it holds. */
const FRAME = /\n[^\S\n]+at[^\S\n][^\n]*/y;
const LINE_FEED = 0x0a;
/* The fields of an error read by name, not copied as its own. */
const ERROR_FIELDS: ReadonlySet<string> = new Set(["name", "message", "stack", "cause", "errors"]);

/** Reads one part of an error: its cause or one of its errors, or one of its fields by name. */
export type ReadPart = (part: unknown, field?: string) => unknown;

/**
 * An error with what could be a credential cut out: the error itself where
 * nothing in it needed cutting, or a copy that prints as it does — its
 * name, its message and the header its stack starts with cut, the frames
 * after that header kept, its own fields and its causes read in turn. The
 * copy is an `Error`, or an `AggregateError` for one, whatever class the
 * error was.
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
  const name = attempt(() => error.name);
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
  const code = fields.find(([field]) => field === "code")?.[1];
  const trace = attempt(() => error.stack);
  const headers = headersOf(name, said === undefined ? "" : text, code);
  const stack = typeof trace === "string" ? stackWithoutSecrets(trace, headers) : undefined;
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

/**
 * The headers an error's stack may start with, each its name and its
 * message: joined as `Error.prototype.toString` joins them, the name alone
 * for no message and the message alone for no name, as V8 and Node write
 * one; with the code beside the name, as Node writes its own errors'; and
 * as source-map-support and Vite's module runner write one, `Error` for no
 * name and the colon kept for no message.
 */
function headersOf(name: unknown, message: string | typeof FAILED, code: unknown): string[] {
  const called =
    name === FAILED ? FAILED : name === undefined ? "Error" : attempt(() => String(name));
  if (called === FAILED || message === FAILED) return [];
  const header = called === "" ? message : message === "" ? called : `${called}: ${message}`;
  const coded = typeof code === "string" ? [`${called} [${code}]: ${message}`] : [];
  return [header, ...coded, `${called || "Error"}: ${message}`];
}

/**
 * The stack with what could be a credential cut. An engine starts a stack
 * with the error's header, then writes a frame a line: where the stack
 * starts with a header read from the error, that header is cut as text, the
 * frames after it are kept as they are, and what code wrote past them —
 * another error's stack, a note — is cut as text. A line of the message can
 * take a frame's shape, so the message is told by itself, never by the first
 * line shaped like a frame. A stack that starts otherwise — set by code,
 * formatted before its name or message changed, written by an engine with no
 * header or by a formatter of its own — is cut whole, as text.
 */
function stackWithoutSecrets(stack: string, headers: readonly string[]): string {
  const header = headers.find(
    (start) =>
      stack.startsWith(start) &&
      (stack.length === start.length || stack.charCodeAt(start.length) === LINE_FEED),
  );
  if (header === undefined) return redactedText(stack);
  let end = header.length;
  FRAME.lastIndex = end;
  while (FRAME.test(stack)) end = FRAME.lastIndex;
  /* Cut text loses the line break it starts with: it is put back. */
  const past = end < stack.length ? `\n${redactedText(stack.slice(end + 1))}` : "";
  return `${redactedText(header)}${stack.slice(header.length, end)}${past}`;
}

/* Not every runtime has AggregateError; one that has none throws none. */
function isAggregate(error: Error): error is AggregateError {
  return typeof AggregateError === "function" && error instanceof AggregateError;
}
