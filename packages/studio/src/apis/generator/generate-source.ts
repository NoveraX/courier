/**
 * Generates an import's source file: `defineApi`, holding the API's own
 * endpoints and listing its groups.
 */

import type { ParsedEndpoint, ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { sourceAuth } from "./auth-middleware";
import { endpointContext } from "./endpoint-context";
import { endpointEntries } from "./endpoint-entries";
import { basesDeclaration, defineImport, endpointImports } from "./endpoint-imports";
import { groupLocalName } from "./group-local-name";
import { sortedStatements } from "./import-order";
import { jsdocText } from "./jsdoc-text";
import { jsLiteral } from "./literals";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/** The endpoints a source holds itself, in no group, as they are written. */
export interface SourceEndpoints {
  /** The endpoints, their types already extracted. */
  endpoints: readonly ParsedEndpoint[];
  /** The schemas the import's own module declares, by name. */
  declared: Readonly<Record<string, ParsedSchema>>;
  /** The type naming each endpoint's variables, by the endpoint's name. */
  params: Readonly<Record<string, string>>;
}

/**
 * Write the source: `defineApi` with the import's base URL, its auth when
 * asked for, the endpoints in no group, and the groups that sit in no other
 * group, each imported from its own folder. A source with neither still
 * names one, as `defineApi` takes groups or endpoints: endpoints for an
 * import generated in no group, groups otherwise.
 *
 * @param own - The API's own endpoints, as written
 * @param groups - The groups the source lists, in order
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @returns The source file
 * @example
 * ```ts
 * generateSourceFile({ endpoints: [], declared: {}, params: {} }, spec.groups, spec, options).path;
 * // "src/api/pets/source.ts"
 * ```
 */
export function generateSourceFile(
  own: SourceEndpoints,
  groups: readonly ParsedGroup[],
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
): GeneratedFile {
  const context = endpointContext(spec, options, own.declared);
  const entries = endpointEntries([...own.endpoints], context, own.params);
  const holds = own.endpoints.length > 0;
  const auth = options.addAuthMiddleware
    ? sourceAuth(spec.securitySchemes, options.sourceName)
    : null;
  const lists = groups.length > 0 || (!holds && options.groupBy !== "single");
  const imports = sortedStatements([
    holds
      ? defineImport(context, "defineApi")
      : `import { defineApi } from "@noverax/courier/define";`,
    ...endpointImports(context, auth ? ["authMiddleware"] : []),
    ...groups.map((group) => groupImport(group, options)),
  ]);
  const lines = [
    ...imports,
    "",
    ...(holds ? [basesDeclaration(context), ""] : []),
    `export const ${options.sourceName} = defineApi({`,
    `  baseURL: ${jsLiteral(spec.baseURL)},`,
    ...(auth ? [`  middleware: [${auth.middleware}],`] : []),
    ...(holds || !lists ? [`  endpoints: {`, ...entries, `  },`] : []),
    ...(lists ? groupEntries(groups, options) : []),
    `});`,
    "",
    ...(auth ? auth.helper : []),
  ];
  return { path: options.layout.sourceFile, content: lines.join("\n") };
}

function groupImport(group: ParsedGroup, options: ResolvedGenerateOptions): string {
  const local = groupLocalName(group.name, options.sourceName);
  const imported = local === group.name ? group.name : `${group.name} as ${local}`;
  const from = `${options.layout.groupSpecifier(group.name, "index")}${options.importExtension}`;
  return `import { ${imported} } from "${from}";`;
}

function groupEntries(groups: readonly ParsedGroup[], options: ResolvedGenerateOptions): string[] {
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
