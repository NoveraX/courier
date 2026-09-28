/**
 * The imports of a file of endpoints: exactly what its definitions use.
 */

import type { EndpointContext } from "./endpoint-context";
import type { ResolvedGenerateOptions } from "./types";

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
/**
 * The import of what a file defines its endpoints with: `courier`, the
 * definer, `formBody` when a closure writes a url-encoded body, and
 * `formQuery` when one writes query values in a style of their own.
 *
 * @param context - The file's endpoints, written
 * @param definer - `defineGroup` for a group's file, `defineApi` for a flat source's
 * @returns The import statement
 * @example
 * ```ts
 * defineImport(context, "defineGroup"); // → 'import { courier, defineGroup } from "@noverax/courier/define";'
 * ```
 */
export function defineImport(
  context: EndpointContext,
  definer: "defineGroup" | "defineApi",
): string {
  const names = [
    "courier",
    definer,
    ...(context.uses.formBody ? ["formBody"] : []),
    ...(context.uses.formQuery ? ["formQuery"] : []),
  ];
  return `import { ${names.join(", ")} } from "@noverax/courier/define";`;
}

/**
 * The line that takes the builders a file's definitions start from out of
 * `courier()`: `endpoint`, and `stream` when a stream of events is among them.
 *
 * @param context - The file's endpoints, written
 * @returns The declaration
 * @example
 * ```ts
 * basesDeclaration(context); // → "const { endpoint, stream } = courier();"
 * ```
 */
export function basesDeclaration(context: EndpointContext): string {
  const { bases } = context.uses;
  const names =
    bases.size === 0 ? ["endpoint"] : (["endpoint", "stream"] as const).filter((b) => bases.has(b));
  return `const { ${names.join(", ")} } = courier();`;
}

function schemasModule(options: ResolvedGenerateOptions): string {
  return `${options.generateSchemas ? "./schemas" : "./types"}${options.importExtension}`;
}
