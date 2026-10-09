import { codeMatches, nextCode, type SourceScan } from "./source-scan";

/** An object's `{…}` or an array's `[…]` in a file, by the indexes of its brackets. */
export interface Literal {
  readonly open: number;
  readonly close: number;
}

/* The literal a bracket at `at` opens, when it opens one. */
function literalAt(scan: SourceScan, at: number): Literal | undefined {
  const char = scan.text[at];
  const close = scan.closer.get(at);
  return (char === "{" || char === "[") && close !== undefined ? { open: at, close } : undefined;
}

/* The literal a top-level `const name` is set to, its type annotation skipped. */
function constLiteral(scan: SourceScan, name: string): Literal | undefined {
  const found = codeMatches(
    scan,
    new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\b`, "g"),
  );
  if (found.length !== 1 || found[0] === undefined) return undefined;
  const equals = scan.text.indexOf("=", found[0].index + found[0][0].length);
  return equals === -1 ? undefined : literalAt(scan, nextCode(scan, equals + 1));
}

/**
 * The literal a file's `export default` gives: one written there, the first
 * argument of a call to one of `callees` — `defineConfig({…})` — or the one
 * a top-level `const` of the name it exports is set to.
 *
 * @param scan - The scanned file
 * @param callees - The functions whose first argument counts
 * @returns The literal, or `undefined` when the file exports something else, or more than once
 * @example
 * ```ts
 * defaultExportLiteral(scan, ["defineConfig"]); // the `{…}` in `export default defineConfig({…})`
 * ```
 */
export function defaultExportLiteral(
  scan: SourceScan,
  callees: readonly string[],
): Literal | undefined {
  const exports = codeMatches(scan, /\bexport\s+default\b/g);
  if (exports.length !== 1 || exports[0] === undefined) return undefined;
  const at = nextCode(scan, exports[0].index + exports[0][0].length);
  const direct = literalAt(scan, at);
  if (direct) return direct;
  const name = /^[A-Za-z_$][\w$]*/.exec(scan.text.slice(at))?.[0];
  if (name === undefined) return undefined;
  const after = nextCode(scan, at + name.length);
  if (scan.text[after] !== "(") return constLiteral(scan, name);
  return callees.includes(name) ? literalAt(scan, nextCode(scan, after + 1)) : undefined;
}

/**
 * The object literal a decorator is called with: `@Module({…})`.
 *
 * @param scan - The scanned file
 * @param name - The decorator's name
 * @returns The literal, or `undefined` unless the file has exactly one such call
 * @example
 * ```ts
 * decoratorLiteral(scan, "Module");
 * ```
 */
export function decoratorLiteral(scan: SourceScan, name: string): Literal | undefined {
  const found = codeMatches(scan, new RegExp(`@${name}\\s*\\(`, "g"));
  if (found.length !== 1 || found[0] === undefined) return undefined;
  return literalAt(scan, nextCode(scan, found[0].index + found[0][0].length));
}

/** A property of an object literal, by where its key and its value start. */
export interface Property {
  readonly key: string;
  readonly value: number;
}

const KEY = /^(?:([A-Za-z_$][\w$]*)|"([^"]*)"|'([^']*)')\s*:/;

/**
 * The properties written directly in an object literal, in order; a
 * spread or a method reads as a property without a key.
 *
 * @param scan - The scanned file
 * @param object - The object
 * @returns Each property's key — empty where it has none — and where its value starts
 * @example
 * ```ts
 * properties(scan, object).find((property) => property.key === "plugins");
 * ```
 */
export function properties(scan: SourceScan, object: Literal): Property[] {
  const found: Property[] = [];
  let start = object.open + 1;
  for (let at = start; at <= object.close; at++) {
    const nested = scan.code[at] === 1 ? scan.closer.get(at) : undefined;
    if (nested !== undefined) {
      at = nested;
      continue;
    }
    if (at !== object.close && (scan.code[at] !== 1 || scan.text[at] !== ",")) continue;
    const first = nextCode(scan, start);
    if (first !== -1 && first < at) {
      const key = KEY.exec(scan.text.slice(first, at));
      const name = key ? (key[1] ?? key[2] ?? key[3] ?? "") : "";
      const value = key ? nextCode(scan, first + key[0].length) : first;
      found.push({ key: name, value });
    }
    start = at + 1;
  }
  return found;
}

/**
 * The literal under a key of an object literal.
 *
 * @param scan - The scanned file
 * @param object - The object
 * @param key - The key
 * @returns The literal; `null` when the object has no such key; `undefined` when its value is not a literal, or the key is written twice
 * @example
 * ```ts
 * propertyLiteral(scan, config, "plugins"); // the `[…]` of `plugins: […]`
 * ```
 */
export function propertyLiteral(
  scan: SourceScan,
  object: Literal,
  key: string,
): Literal | null | undefined {
  const named = properties(scan, object).filter((property) => property.key === key);
  if (named.length === 0) return null;
  const [property] = named;
  return named.length === 1 && property ? literalAt(scan, property.value) : undefined;
}
