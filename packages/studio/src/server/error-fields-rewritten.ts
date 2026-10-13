import { isPlainObject } from "./is-plain-object";
import { jsonStringsRewritten } from "./json-strings-rewritten";

/* The fields an answer that succeeded says what went wrong in, at any depth. */
const ERROR_FIELDS: ReadonlySet<string> = new Set([
  "error",
  "errors",
  "problem",
  "problems",
  "reason",
  "reasons",
  "message",
  "messages",
  "detail",
  "details",
  "cause",
  "warning",
  "warnings",
  "why",
  "refusal",
  "failed",
  "failures",
  "unreadable",
  "lastError",
  "stack",
  "issues",
  "hint",
  "notes",
]);

type Rewrite = (text: string) => string;

/**
 * A value with what its fields that say what went wrong — `error`,
 * `problem`, `reason`, `message`, `warnings` and the like — say rewritten,
 * wherever they are — in an object, in a list, in a list of lists — and an
 * `Error` anywhere in it rewritten whole. Everything else is the value's own, shared, not
 * copied: an answer can be megabytes of what a page shows.
 *
 * @param value - The answer, as a route hands it to `res.json`
 * @param rewrite - What rewrites a string
 * @returns The value itself when nothing in it changes; a copy of what changes otherwise
 * @example
 * ```ts
 * errorFieldsRewritten({ results: [{ name: "a", error: "open '/Users/ana/x'" }] }, scrub);
 * // → { results: [{ name: "a", error: "open '~/x'" }] }
 * ```
 */
export function errorFieldsRewritten(value: unknown, rewrite: Rewrite): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Error) return jsonStringsRewritten(value, rewrite);
  if (Array.isArray(value)) return itemsRewritten(value, rewrite);
  if (isPlainObject(value) && typeof value.toJSON !== "function") {
    return fieldsRewritten(value, rewrite);
  }
  /* A class instance sends what JSON makes of it; only that can hold a field. */
  const sent = jsonStringsRewritten(value, (text) => text);
  const shown = errorFieldsRewritten(sent, rewrite);
  return shown === sent ? value : shown;
}

function itemsRewritten(items: readonly unknown[], rewrite: Rewrite): readonly unknown[] {
  let copy: unknown[] | undefined;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const next = errorFieldsRewritten(item, rewrite);
    if (next !== item) copy ??= items.slice();
    if (copy) copy[index] = next;
  }
  return copy ?? items;
}

function fieldsRewritten(fields: Record<string, unknown>, rewrite: Rewrite): object {
  let copy: Record<string, unknown> | undefined;
  for (const key of Object.keys(fields)) {
    const item = fields[key];
    const next = ERROR_FIELDS.has(key)
      ? jsonStringsRewritten(item, rewrite)
      : errorFieldsRewritten(item, rewrite);
    if (next === item) continue;
    copy ??= { ...fields };
    /* Defined, not assigned: a key such as `__proto__` stays a field of its own. */
    Object.defineProperty(copy, key, {
      value: next,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy ?? fields;
}
