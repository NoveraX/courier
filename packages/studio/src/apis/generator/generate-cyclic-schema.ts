/**
 * Code generator for a schema on a reference cycle.
 */

import type { ParsedSchema } from "../parser/types";
import { jsdocText } from "./jsdoc-text";
import { schemaToInterface, typeStyleFor } from "./schema-types";
import { lazyDeclaration, schemaToValidation } from "./schema-utils";
import type { GeneratorSettings } from "./types";

/**
 * Declare a schema on a reference cycle lazily, whatever its shape.
 *
 * Only objects used to be deferred, so a union or a list that names itself —
 * an expression tree, say — read its own constant before it existed and the
 * module threw on import.
 *
 * @param lines - Output the declaration is appended to
 * @param name - Schema name, without the `Schema` suffix
 * @param schema - The schema on the cycle
 * @param options - Generator options
 */
export function generateCyclicSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GeneratorSettings,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }
  /* The compiler cannot infer a type that mentions itself, so the lazy
     declaration needs a written one. */
  const typeName = options.generateTypes ? name : undefined;
  if (typeName)
    lines.push(`export type ${name} = ${schemaToInterface(schema, typeStyleFor(options))}`, "");

  const body =
    schema.type === "ref" ? `${schema.refName}Schema` : schemaToValidation(schema, options);
  lines.push(
    lazyDeclaration(name, body, typeName, options) ?? `export const ${name}Schema = ${body};`,
  );
  lines.push("");
}
