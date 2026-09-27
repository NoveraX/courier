import type { Program } from "oxc-parser";

/** One top-level statement of a parsed module. */
type TopLevel = Program["body"][number];

/* A relative specifier that names a JavaScript file an ES module loads. */
const RELATIVE_WITH_EXTENSION = /^\.\.?\/.*\.m?js$/;

/**
 * Whether a module names the files of its relative imports with their
 * extensions, as Node's resolution of ES modules requires: one of its
 * imports or re-exports from `./` or `../` ends in `.js` or `.mjs`.
 *
 * @param program - The parsed module
 * @returns `true` when a relative import or re-export carries `.js` or `.mjs`
 *
 * @example
 * ```ts
 * // import { api } from "./src/api.js";
 * importsCarryExtensions(program); // → true
 * ```
 */
export function importsCarryExtensions(program: Program): boolean {
  return program.body.some((statement) => {
    const source = sourceOf(statement);
    return source !== null && RELATIVE_WITH_EXTENSION.test(source);
  });
}

function sourceOf(statement: TopLevel): string | null {
  switch (statement.type) {
    case "ImportDeclaration":
    case "ExportAllDeclaration":
      return statement.source.value;
    case "ExportNamedDeclaration":
      return statement.source?.value ?? null;
    default:
      return null;
  }
}
