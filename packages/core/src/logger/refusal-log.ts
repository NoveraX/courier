import { createLogger } from "./index";

/** What tells one refusal apart: plain values, an absent one left out. */
export type RefusalFields = Readonly<Record<string, string | number | undefined>>;

/** An expected refusal, as a log line names it. */
export interface Refusal {
  /** What was refused, the line's subject: `"connection refused"` */
  readonly event: string;
  /** The code it was refused with: a close code, a realtime error code, an HTTP status */
  readonly code: number;
  /** The connection, the endpoint, a tag of the address — never a credential */
  readonly fields?: RefusalFields | undefined;
}

/** Writes expected refusals, one line each, at most once an interval for each kind. */
export interface RefusalLog {
  warn(refusal: Refusal, cause?: unknown): void;
  info(refusal: Refusal, cause?: unknown): void;
}

export interface RefusalLogOptions {
  /** How long one kind of refusal is printed once in (default 10 s) */
  intervalMs?: number | undefined;
  /** How many kinds of refusal are counted at once (default 1000) */
  maxKeys?: number | undefined;
}

type Level = "warn" | "info";

/** One kind of refusal — its level, event and code — and what came of it since it was printed. */
interface Kind {
  readonly level: Level;
  readonly head: string;
  readonly since: number;
  more: number;
}

const MAX_REASON = 200;
/* How much of a reason is read: four times what is kept, so a reason of any size costs the same. */
const READ = 4 * MAX_REASON;
const WHITESPACE = /\s/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it takes out
const UNPRINTABLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
const BARE = /^[^\s"=\\]+$/;

/**
 * A log for refusals a program expects — a token it does not take, a limit
 * reached, a client that does not answer — which are no faults of the
 * program: each is one line with what was refused, its code, why — the
 * thrown error's name and message — and what tells it apart, never a stack.
 * The stack is printed on a line of its own at the debug level, for whoever
 * looks into one.
 *
 * Any client can provoke a refusal, so each kind — level, event and code —
 * is printed once an interval; the rest are counted, and how many came is
 * said once the interval is over. At most `maxKeys` kinds are counted; the
 * one counted longest ago is summed up and let go first.
 *
 * What the error says is what the application put in it, and goes to the
 * log only: a hook should not put a credential in its error's message.
 *
 * @param context - The scope the lines are written under: `"WS"`
 * @param options - The interval and the number of kinds counted at once
 * @returns The log
 * @example
 * ```ts
 * const refusals = createRefusalLog("WS");
 * refusals.warn({ event: "connection refused", code: 4401, fields: { conn: id } }, error);
 * // WARN courier:ws  connection refused code=4401 reason="Error: invalid token" conn=c_7f3k
 * ```
 */
export function createRefusalLog(context: string, options: RefusalLogOptions = {}): RefusalLog {
  const log = createLogger(context);
  const intervalMs = options.intervalMs ?? 10_000;
  const maxKeys = options.maxKeys ?? 1_000;
  const kinds = new Map<string, Kind>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function sumUp(kind: Kind): void {
    if (kind.more === 0) return;
    log[kind.level](`${kind.head}: ${kind.more} more in the last ${intervalMs / 1000}s`);
    kind.more = 0;
  }

  /* One timer for every kind, running only while some kind has a count to say. */
  function schedule(): void {
    if (timer !== undefined) return;
    let due = Number.POSITIVE_INFINITY;
    for (const kind of kinds.values()) if (kind.more > 0) due = Math.min(due, kind.since);
    if (due === Number.POSITIVE_INFINITY) return;
    timer = setTimeout(flush, Math.max(0, due + intervalMs - Date.now()));
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  }

  function flush(): void {
    timer = undefined;
    const now = Date.now();
    for (const [key, kind] of kinds) {
      if (now - kind.since < intervalMs) continue;
      sumUp(kind);
      kinds.delete(key);
    }
    schedule();
  }

  function write(level: Level, refusal: Refusal, cause: unknown): void {
    const head = `${refusal.event} code=${refusal.code}`;
    const key = `${level}\u0000${head}`;
    const now = Date.now();
    const known = kinds.get(key);
    if (known !== undefined) kinds.delete(key);
    if (known !== undefined && now - known.since < intervalMs) {
      known.more++;
      kinds.set(key, known);
      schedule();
      return;
    }
    if (known !== undefined) sumUp(known);
    kinds.set(key, { level, head, since: now, more: 0 });
    if (kinds.size > maxKeys) letGoOfOldest();
    log[level](lineOf(head, cause, refusal.fields));
    if (cause !== undefined) log.debug(`${head}: what was thrown`, cause);
  }

  function letGoOfOldest(): void {
    const [oldest] = kinds;
    if (oldest === undefined) return;
    sumUp(oldest[1]);
    kinds.delete(oldest[0]);
  }

  return {
    warn: (refusal, cause) => write("warn", refusal, cause),
    info: (refusal, cause) => write("info", refusal, cause),
  };
}

function lineOf(head: string, cause: unknown, fields: RefusalFields | undefined): string {
  const parts = [head];
  if (cause !== undefined) parts.push(`reason=${JSON.stringify(reasonOf(cause))}`);
  for (const [name, value] of Object.entries(fields ?? {})) {
    if (value === undefined) continue;
    const text = String(value);
    parts.push(`${name}=${BARE.test(text) ? text : JSON.stringify(text)}`);
  }
  return parts.join(" ");
}

/* A thrown error by its name and message; anything else by what it is, so
   an object thrown in its place does not spill its fields into the log. */
function reasonOf(cause: unknown): string {
  let said: string;
  if (cause instanceof Error) {
    const message = String(cause.message);
    said = message === "" ? cause.name : `${cause.name}: ${message}`;
  } else if (typeof cause === "string") {
    said = cause;
  } else if (typeof cause === "number" || typeof cause === "boolean" || typeof cause === "bigint") {
    said = String(cause);
  } else {
    said = `a thrown ${cause === null ? "null" : typeof cause}`;
  }
  return oneLine(said);
}

/* The reason on one line, at most MAX_REASON characters. A cut — of what is read, then of what is
   kept — drops the word it falls inside rather than show it in part: half a token is still a token,
   and the redaction every line goes through knows a token only whole. */
function oneLine(text: string): string {
  const read = wholeWords(text, READ);
  const flat = read.replace(UNPRINTABLE, " ").replace(/\s+/g, " ").trim();
  const points = [...flat];
  if (read === text && points.length <= MAX_REASON) return flat;
  /* One place is kept for the ellipsis; the place after the cut says whether it fell inside a word. */
  const kept = points.slice(0, MAX_REASON - 1).join("");
  const whole =
    points.length < MAX_REASON || points[MAX_REASON - 1] === " "
      ? kept
      : kept.slice(0, kept.lastIndexOf(" ") + 1);
  return `${whole.trimEnd()}…`;
}

/* The start of a text, at most `limit` code units, ending where a word ends. */
function wholeWords(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let end = limit;
  while (end > 0 && !WHITESPACE.test(text.charAt(end))) end -= 1;
  return text.slice(0, end);
}
