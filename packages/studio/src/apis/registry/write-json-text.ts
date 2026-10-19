/** An object or a list being written: the keys left, or `null` for a list written by index. */
interface Frame {
  readonly holder: object;
  readonly keys: readonly string[] | null;
  readonly length: number;
  next: number;
  wrote: boolean;
}

/* What JSON leaves out of an object: undefined, a function, a symbol. */
const ABSENT = Symbol("absent");

/* A string JSON writes between quotes as it is, nothing in it to escape. */
const NEEDS_ESCAPE = /["\\\p{Cc}\p{Cs}]/u;

/**
 * Write the text `JSON.stringify(value)` returns, piece by piece, walking
 * objects and lists with a stack of its own rather than the call stack, so
 * a value nested deeper than the stack goes is written too. A plain object
 * or a list is walked here; anything else — a primitive, a date, a boxed
 * value, an instance, a value with `toJSON` — is written as JSON.stringify
 * writes it under its key. An object inside itself throws, as there.
 *
 * @param value - Anything JSON.stringify takes
 * @param write - Takes each piece, in order
 * @returns Whether anything was written: JSON.stringify returns `undefined` for a value it leaves out
 * @throws {TypeError} For an object inside itself, or a BigInt, as JSON.stringify throws
 * @example
 * ```ts
 * const pieces: string[] = [];
 * writeJsonText({ a: [1, undefined] }, (piece) => pieces.push(piece));
 * pieces.join(""); // → '{"a":[1,null]}'
 * ```
 */
export function writeJsonText(value: unknown, write: (piece: string) => void): boolean {
  const open = new Set<object>();
  const frames: Frame[] = [];
  const put = (key: string, item: unknown, separator: string): boolean => {
    if (typeof item === "object" && item !== null && isPlainContainer(item)) {
      write(separator);
      frames.push(entered(item, open, write));
      return true;
    }
    const text = nativeText(key, item);
    if (text === ABSENT) return false;
    write(separator + text);
    return true;
  };
  if (!put("", value, "")) return false;
  for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
    if (!wroteNext(frame, put)) {
      write(frame.keys === null ? "]" : "}");
      open.delete(frame.holder);
      frames.pop();
    }
  }
  return true;
}

/* An object or a list begun: its opening written, and a frame to write the rest from. */
function entered(container: object, open: Set<object>, write: (piece: string) => void): Frame {
  if (open.has(container)) throw new TypeError("Converting circular structure to JSON");
  open.add(container);
  const list = Array.isArray(container);
  write(list ? "[" : "{");
  const length = list ? Number(Reflect.get(container, "length")) : 0;
  return {
    holder: container,
    keys: list ? null : Object.keys(container),
    length,
    next: 0,
    wrote: false,
  };
}

/* The frame's next entry written, or `false` once there is none left. */
function wroteNext(
  frame: Frame,
  put: (key: string, item: unknown, separator: string) => boolean,
): boolean {
  const { keys } = frame;
  if (frame.next >= (keys === null ? frame.length : keys.length)) return false;
  const index = frame.next;
  frame.next += 1;
  const key = keys === null ? String(index) : (keys[index] ?? "");
  const item: unknown = Reflect.get(frame.holder, key);
  if (keys === null) {
    if (!put(key, item, index > 0 ? "," : "")) put(key, null, index > 0 ? "," : "");
    return true;
  }
  if (put(key, item, `${frame.wrote ? "," : ""}${quoted(key)}:`)) frame.wrote = true;
  return true;
}

/* An object or a list JSON writes entry by entry, having nothing of its own to say how. */
function isPlainContainer(value: object): boolean {
  if (typeof Reflect.get(value, "toJSON") === "function" || isRawJson(value)) return false;
  if (Array.isArray(value)) return true;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRawJson(value: object): boolean {
  const isRawJSON: unknown = Reflect.get(JSON, "isRawJSON");
  return typeof isRawJSON === "function" && Reflect.apply(isRawJSON, JSON, [value]) === true;
}

/* The text of anything not walked, as JSON.stringify writes it under its key, toJSON and all. */
function nativeText(key: string, value: unknown): string | typeof ABSENT {
  if (typeof value === "string") return quoted(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  if (typeof value === "number") return JSON.stringify(value);
  const wrapped = JSON.stringify({ [key]: value });
  return wrapped.length === 2 ? ABSENT : wrapped.slice(JSON.stringify(key).length + 2, -1);
}

function quoted(text: string): string {
  return NEEDS_ESCAPE.test(text) ? JSON.stringify(text) : `"${text}"`;
}
