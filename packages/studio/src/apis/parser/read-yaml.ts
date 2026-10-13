import {
  type Document,
  isScalar,
  LineCounter,
  type ParsedNode,
  parseDocument,
  visit,
  type YAMLParseError,
} from "yaml";

import { prettifyYamlError } from "./prettify-yaml-error";

/**
 * Read a YAML document into plain values, as `yaml`'s `parse` does — the
 * same values, the same first error with the same position and text —
 * without the time `parse` takes to look for a key named twice.
 *
 * `yaml` refuses a mapping that names a key twice by comparing each key
 * with every key before it in the mapping, so a mapping of forty thousand
 * keys took seconds and one of a few hundred thousand took minutes. Here
 * that check keeps each mapping's keys in a set instead, and takes time in
 * proportion to the keys — keys of more than 16,383 characters excepted,
 * which V8 hashes by their length alone. Only that check is linear: an
 * alias resolved many times, an `!!omap` under YAML 1.1, those long keys
 * and the objects built from them still take `yaml` and V8 longer than the
 * text's length, which is why Studio reads a specification in a process of
 * its own, within a budget of time and memory.
 *
 * `yaml` reports a key named twice where it finds it, among its other
 * errors in the order it finds them. Once a key is named twice, the text is
 * read again with `yaml` told that every key but a mapping's first repeats
 * one — each report costs it no comparison — and the reports of keys that
 * do not repeat are dropped, which leaves its errors as `parse` reports
 * them.
 *
 * @param text - The YAML
 * @returns What the document holds
 * @throws {YAMLParseError} At the first error `parse` reports, a key named twice in one mapping among them
 * @example
 * ```ts
 * readYaml("openapi: 3.1.0\ninfo: {title: Pets, version: '1'}"); // → { openapi: "3.1.0", info: { … } }
 * readYaml("a: 1\na: 2"); // throws "Map keys must be unique at line 2, column 1: …"
 * ```
 */
export function readYaml(text: string): unknown {
  const doc = parseDocument(text, { uniqueKeys: false });
  const first = hasRepeatedKey(doc) ? firstErrorWithKeysChecked(text, doc.errors) : doc.errors[0];
  if (first !== undefined) throw first;
  return doc.toJS();
}

/* As `yaml` compares two keys: scalars of the same value; not-a-number equals nothing. */
function isComparable(key: unknown): key is { value: unknown } {
  return isScalar(key) && !Number.isNaN(key.value);
}

function hasRepeatedKey(doc: Document): boolean {
  let found = false;
  visit(doc, {
    Map(_, map) {
      const seen = new Set<unknown>();
      for (const { key } of map.items) {
        if (!isComparable(key)) continue;
        if (seen.has(key.value)) {
          found = true;
          return visit.BREAK;
        }
        seen.add(key.value);
      }
      return undefined;
    },
  });
  return found;
}

/* The errors of the read before, in the same order, with each key named
   twice where `yaml` finds it among them. */
function firstErrorWithKeysChecked(
  text: string,
  before: readonly YAMLParseError[],
): YAMLParseError | undefined {
  const lineCounter = new LineCounter();
  const { errors, repeats } = readReportingEveryKey(text, lineCounter);
  let reported = 0;
  for (const error of errors) {
    if (error.code !== "DUPLICATE_KEY") return before[0] ?? error;
    if (repeats[reported++] === true) return prettifyYamlError(error, text, lineCounter);
  }
  return before[0];
}

/* `yaml` asks whether a key repeats with the mapping's first key first, so
   that key names the mapping. Each report is an error object: without a
   stack, one costs `yaml` half the time and memory. */
function readReportingEveryKey(
  text: string,
  lineCounter: LineCounter,
): { errors: readonly YAMLParseError[]; repeats: readonly boolean[] } {
  const repeats: boolean[] = [];
  const keysOf = new WeakMap<ParsedNode, Set<unknown>>();
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    const doc = parseDocument(text, {
      prettyErrors: false,
      lineCounter,
      uniqueKeys: (first, key) => {
        repeats.push(repeatsKey(keysOf, first, key));
        return true;
      },
    });
    return { errors: doc.errors, repeats };
  } finally {
    Error.stackTraceLimit = limit;
  }
}

function repeatsKey(
  keysOf: WeakMap<ParsedNode, Set<unknown>>,
  first: ParsedNode,
  key: ParsedNode,
): boolean {
  let seen = keysOf.get(first);
  if (seen === undefined) {
    seen = new Set(isComparable(first) ? [first.value] : []);
    keysOf.set(first, seen);
  }
  if (!isComparable(key)) return false;
  const repeated = seen.has(key.value);
  seen.add(key.value);
  return repeated;
}
