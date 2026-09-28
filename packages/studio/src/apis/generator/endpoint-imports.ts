/**
 * The imports of a file of endpoints: exactly what its definitions use.
 */

import type { EndpointContext } from "./endpoint-context";
import type { GeneratorSettings } from "./types";

/** How each validation library is imported under the name the chains call. */
const VALIDATOR_IMPORT: Readonly<Record<string, string>> = {
  zod: `import { z } from "zod";`,
  valibot: `import * as v from "valibot";`,
  arktype: `import { type } from "arktype";`,
};

/**
 * Import what a file's endpoint definitions use, once they are all written.
 *
 * A type is imported as a type, so a project compiling with
 * `verbatimModuleSyntax` — Vite's default — accepts the file, and a bundler
 * never looks for a value the schemas module does not export.
 *
 * @param context - The file, after its definitions were built
 * @returns The import lines, the validator's first
 * @example
 * ```ts
 * endpointImports(context);
 * // ['import { z } from "zod";', 'import { PetSchema, type ListPetsParams } from "./schemas";']
 * ```
 */
export function endpointImports(context: EndpointContext): string[] {
  const { uses, options } = context;
  const lines: string[] = [];
  const validator = VALIDATOR_IMPORT[options.validation];
  if (uses.validator && validator) lines.push(validator);

  const names = [...uses.values, ...[...uses.types].map((name) => `type ${name}`)];
  if (names.length > 0) {
    lines.push(`import { ${names.join(", ")} } from "${schemasModule(options)}";`);
  }
  return lines;
}

/**
 * The module beside the endpoints that declares their schemas and types.
 * Its name follows `generateSchemas` alone: `validation: "none"` still
 * writes schemas.ts, holding types.
 */
function schemasModule(options: GeneratorSettings): string {
  return options.generateSchemas ? "./schemas" : "./types";
}
