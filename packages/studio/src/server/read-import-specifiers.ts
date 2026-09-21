/**
 * Read every module specifier a source file imports or re-exports.
 *
 * Parsing is done by oxc, which reads TypeScript and JSX natively. The
 * TypeScript compiler could do the same, but only if the project has it: it is
 * an optional peer a JavaScript-only project is entitled not to install, and
 * TypeScript 7 publishes no parser under its package root at all. Either
 * absence used to leave the watcher tracking the config file alone, so edits
 * to the modules behind it reloaded nothing.
 *
 * A file that does not parse cleanly still yields the specifiers oxc did
 * recover, which is what a config being edited looks like between keystrokes.
 */

import { readFileSync } from "node:fs";

import { createLogger } from "@noverax/courier";
import { parseSync } from "oxc-parser";

const log = createLogger("Studio");

/** A byte range in the parsed source. */
interface Span {
  start: number;
  end: number;
}

/**
 * Collect the specifiers of every static import, re-export and literal
 * dynamic import in `file`.
 *
 * @param file - Absolute path to a TypeScript or JavaScript source file
 * @returns Specifiers exactly as written, in no particular order
 *
 * @example
 * ```ts
 * readImportSpecifiers("/app/courier.config.ts"); // → ["@/lib/sources"]
 * ```
 */
export function readImportSpecifiers(file: string): string[] {
  let source: string;
  try {
    source = readFileSync(file, "utf-8");
  } catch (err) {
    log.warn(`Could not read ${file}, so the modules it imports are not watched`, err);
    return [];
  }

  const { module } = parseSync(file, source);
  const specifiers: string[] = [];

  for (const entry of module.staticImports) {
    specifiers.push(entry.moduleRequest.value);
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest) specifiers.push(entry.moduleRequest.value);
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
 * at runtime and there is nothing to watch.
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
