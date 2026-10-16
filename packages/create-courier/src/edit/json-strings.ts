import { type Literal, properties, propertyLiteral } from "./literal";
import { nextCode, type SourceScan, scanSource } from "./source-scan";

/* The white space a line starts with. */
function indentAt(text: string, at: number): string {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

/* The step the file indents by: its first indented line's white space. */
function unitOf(text: string): string {
  return /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
}

/*
 * The string a property's value is, by where it starts and ends: a
 * property's value is read as the code after its key, which a string is
 * not, so the string is the text just before it.
 */
function stringBefore(scan: SourceScan, after: number): { start: number; end: number } | undefined {
  let end = after;
  while (end > 0 && /\s/.test(scan.text[end - 1] ?? "")) end--;
  if (scan.literal[end - 1] !== 1) return undefined;
  let start = end - 1;
  while (start > 0 && scan.literal[start - 1] === 1) start--;
  return { start, end };
}

/* Properties added to an object: on lines of their own where it spans lines, else after its last on the same line. */
function appended(scan: SourceScan, object: Literal, entries: readonly string[]): string {
  const { text } = scan;
  let last = object.close - 1;
  while (last > object.open && /\s/.test(text[last] ?? "")) last--;
  const spans = text.slice(object.open, object.close).includes("\n");
  if (last === object.open) {
    const outer = indentAt(text, object.open);
    const inner = spans || text.includes("\n") ? `\n${outer}${unitOf(text)}` : " ";
    const body = entries.join(inner === " " ? ", " : `,${inner}`);
    const end = inner === " " ? " " : `\n${outer}`;
    return `${text.slice(0, object.open + 1)}${inner}${body}${end}${text.slice(object.close)}`;
  }
  const separator = spans ? `,\n${indentAt(text, last)}` : ", ";
  return `${text.slice(0, last + 1)}${separator}${entries.join(separator)}${text.slice(last + 1)}`;
}

/* The object with its existing keys set in place, from the last back so each index still holds. */
function replaced(
  scan: SourceScan,
  object: Literal,
  values: Readonly<Record<string, string>>,
): string {
  let text = scan.text;
  const found = properties(scan, object)
    .filter((property) => Object.hasOwn(values, property.key))
    .sort((a, b) => b.value - a.value);
  for (const property of found) {
    const string = stringBefore(scan, property.value);
    if (string === undefined) continue;
    text = `${text.slice(0, string.start)}${JSON.stringify(values[property.key])}${text.slice(string.end)}`;
  }
  return text;
}

/**
 * A JSON file with string values set under one of its top-level keys —
 * package.json's `scripts` — edited where they go and nowhere else: a
 * value the object holds is replaced where it is written, a new one is
 * added after its last, in the file's own layout and indentation, and the
 * object is added where the file has none. Every other line stays as it
 * is written.
 *
 * @param text - The file
 * @param key - The top-level key
 * @param values - The values to set, by name
 * @returns The file, or `undefined` where it is not one JSON object, or the key holds something else
 * @example
 * ```ts
 * withJsonStrings('{ "scripts": { "dev": "next dev" } }', "scripts", { studio: "courier-studio" });
 * // '{ "scripts": { "dev": "next dev", "studio": "courier-studio" } }'
 * ```
 */
export function withJsonStrings(
  text: string,
  key: string,
  values: Readonly<Record<string, string>>,
): string | undefined {
  const first = scanSource(text);
  const open = first === undefined ? -1 : nextCode(first, 0);
  const close = first?.closer.get(open);
  if (first === undefined || text[open] !== "{" || close === undefined) return undefined;
  const object = propertyLiteral(first, { open, close }, key);
  if (object === null) {
    const empty = appended(first, { open, close }, [`${JSON.stringify(key)}: {}`]);
    return withJsonStrings(empty, key, values);
  }
  if (object === undefined || text[object.open] !== "{") return undefined;
  const changed = replaced(first, object, values);
  const scan = scanSource(changed);
  const root = scan === undefined ? undefined : { open, close: scan.closer.get(open) ?? -1 };
  const again =
    scan === undefined || root === undefined ? undefined : propertyLiteral(scan, root, key);
  if (scan === undefined || again === undefined || again === null) return undefined;
  const have = new Set(properties(scan, again).map((property) => property.key));
  const added = Object.entries(values)
    .filter(([name]) => !have.has(name))
    .map(([name, value]) => `${JSON.stringify(name)}: ${JSON.stringify(value)}`);
  return added.length === 0 ? changed : appended(scan, again, added);
}
