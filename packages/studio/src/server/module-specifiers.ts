import { parseSync } from "oxc-parser";

/** A byte range in the parsed source. */
interface Span {
  start: number;
  end: number;
}

/**
 * Collect the specifiers of every static import, re-export and literal
 * dynamic import in a source text. A text that does not parse cleanly still
 * yields the specifiers oxc recovered.
 *
 * @param fileName - The file's name, whose extension picks the language
 * @param source - Its text
 * @returns The specifiers exactly as written, in no particular order
 * @example
 * ```ts
 * moduleSpecifiers("index.ts", 'import { a } from "./schemas";'); // → ["./schemas"]
 * ```
 */
export function moduleSpecifiers(fileName: string, source: string): string[] {
  const { module } = parseSync(fileName, source);
  const specifiers: string[] = [];

  /* A module imported for its types alone is erased before the config
     runs, so a change to it changes nothing Studio loads. */
  for (const entry of module.staticImports) {
    const typesOnly = entry.entries.length > 0 && entry.entries.every((named) => named.isType);
    if (!typesOnly) specifiers.push(entry.moduleRequest.value);
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest && !entry.isType) specifiers.push(entry.moduleRequest.value);
    }
  }
  for (const entry of module.dynamicImports) {
    const specifier = literalAt(source, entry.moduleRequest);
    if (specifier !== null) specifiers.push(specifier);
  }

  return specifiers;
}

/**
 * A dynamic import's argument is reported as a span, because it need not be a
 * string at all. Only one that is names a file; a computed specifier resolves
 * at runtime and names nothing Studio can find.
 */
function literalAt(source: string, span: Span): string | null {
  const text = source.slice(span.start, span.end);
  const quote = text[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  if (text.length < 2 || text[text.length - 1] !== quote) return null;

  const inner = text.slice(1, -1);
  if (quote === "`" && inner.includes("${")) return null;
  return inner;
}
