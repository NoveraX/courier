import type { GeneratorSettings } from "./types";

/* How each validation library is imported into a schemas module, and the name its code calls. */
const LIBRARIES: ReadonlyMap<string, { statement: string; binding: string }> = new Map([
  ["zod", { statement: `import { z } from "zod";`, binding: "z" }],
  ["valibot", { statement: `import * as v from "valibot";`, binding: "v" }],
  ["arktype", { statement: `import { type } from "arktype";`, binding: "type" }],
]);

/* A line of a comment, which may mention the library without calling it. */
const COMMENT = /^\s*(\/\*|\*|\/\/)/;

/**
 * The import of its validation library a schemas module needs: none when
 * no line of its code calls the library — a group's module whose every
 * declaration names a schema of the import's own, `export const TagSchema
 * = CategorySchema;`, imported it all the same, and a project compiling
 * with `noUnusedLocals` refused the module.
 *
 * @param validation - The validation library
 * @param body - The module's lines below its imports, a helper's text among them
 * @returns The import statement, or none
 * @example
 * ```ts
 * schemasValidatorImport("zod", ["export const TagSchema = CategorySchema;"]); // → []
 * ```
 */
export function schemasValidatorImport(
  validation: GeneratorSettings["validation"],
  body: readonly string[],
): string[] {
  const library = LIBRARIES.get(validation ?? "");
  if (library === undefined) return [];
  const calls = new RegExp(`(?<![\\w$.])${library.binding}[.(]`);
  const code = body.flatMap((line) => line.split("\n")).filter((line) => !COMMENT.test(line));
  return code.some((line) => calls.test(line)) ? [library.statement] : [];
}
