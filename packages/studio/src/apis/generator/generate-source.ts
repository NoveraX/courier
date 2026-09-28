/**
 * Generates the source file (defineApi) of an import generated in groups.
 */

import type { ParsedGroup, ParsedSpec } from "../parser/types";
import { sourceAuth } from "./auth-middleware";
import { groupLocalName } from "./group-local-name";
import { jsdocText } from "./jsdoc-text";
import { jsLiteral } from "./literals";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write the source: `defineApi` with the import's base URL, its auth when
 * asked for, and its groups.
 *
 * @param groups - The groups, as they are generated
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @returns The source file
 * @example
 * ```ts
 * generateSourceFile(spec.groups, spec, options).path; // "src/api/pets/source.ts"
 * ```
 */
export function generateSourceFile(
  groups: ParsedGroup[],
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
): GeneratedFile {
  const auth = options.addAuthMiddleware
    ? sourceAuth(spec.securitySchemes, options.sourceName)
    : null;
  const lines = [`import { defineApi } from "@noverax/courier/define";`];
  if (auth) lines.push(`import { authMiddleware } from "@noverax/courier/middleware";`);

  for (const group of groups) {
    const local = groupLocalName(group.name, options.sourceName);
    const imported = local === group.name ? group.name : `${group.name} as ${local}`;
    lines.push(
      `import { ${imported} } from "${options.layout.groupSpecifier(group.name, "index")}";`,
    );
  }

  lines.push("", `export const ${options.sourceName} = defineApi({`);
  lines.push(`  baseURL: ${jsLiteral(spec.baseURL)},`);
  if (auth) lines.push(`  middleware: [${auth.middleware}],`);
  if (groups.length > 0) lines.push(...groupEntries(groups, options));
  lines.push(`});`, "");
  if (auth) lines.push(...auth.helper);

  return { path: options.layout.sourceFile, content: lines.join("\n") };
}

function groupEntries(groups: ParsedGroup[], options: ResolvedGenerateOptions): string[] {
  const lines = [`  groups: {`];
  for (const group of groups) {
    if (options.includeComments && group.description) {
      lines.push(`    /** ${jsdocText(group.description)} */`);
    }
    const local = groupLocalName(group.name, options.sourceName);
    lines.push(local === group.name ? `    ${group.name},` : `    ${group.name}: ${local},`);
  }
  lines.push(`  },`);
  return lines;
}
