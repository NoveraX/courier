/**
 * Generates group definition files (defineGroup + endpoints).
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { endpointContext } from "./endpoint-context";
import { endpointEntries } from "./endpoint-entries";
import { basesDeclaration, defineImport, endpointImports } from "./endpoint-imports";
import { sortedStatements } from "./import-order";
import { jsLiteral } from "./literals";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write a group's file: its endpoints, the imports they use, and the groups
 * generated inside it — each imported from its own folder under a name of
 * its own, so none meets a binding of this file. A group that only holds
 * other groups takes no builder from `courier()`, which nothing would use.
 *
 * @param group - The group, its endpoints' types already extracted
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @param declared - The schemas the group's endpoints can name, by name
 * @param paramsTypes - The type naming each endpoint's variables, by the endpoint's name
 * @param shared - Of `declared`, those the import's own module declares
 * @returns The file, at the path the layout gives the group
 * @example
 * ```ts
 * generateGroupFile(processed, spec, options, buildSchemaRecord(processed, spec, extracted), params);
 * ```
 */
export function generateGroupFile(
  group: ParsedGroup,
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  declared: Readonly<Record<string, ParsedSchema>>,
  paramsTypes: Readonly<Record<string, string>>,
  shared: ReadonlySet<string> = new Set(),
): GeneratedFile {
  const context = endpointContext(spec, options, declared, shared);
  const entries = endpointEntries(group.endpoints, context, paramsTypes);
  const inner = spec.groups.filter((g) => g.parent === group.name);
  const holds = group.endpoints.length > 0;

  const lines = [
    ...sortedStatements([
      holds
        ? defineImport(context, "defineGroup")
        : `import { defineGroup } from "@noverax/courier/define";`,
      ...endpointImports(context),
      ...inner.map(
        (g) =>
          `import { ${g.name} as ${innerLocal(g)} } from "${options.layout.innerGroupSpecifier(g.name)}${options.importExtension}";`,
      ),
    ]),
    "",
    ...(holds ? [basesDeclaration(context), ""] : []),
    `export const ${group.name} = defineGroup({`,
    `  prefix: ${jsLiteral(group.prefix)},`,
    `  endpoints: {`,
    ...entries,
    `  },`,
    ...(inner.length > 0
      ? [`  groups: {`, ...inner.map((g) => `    ${g.name}: ${innerLocal(g)},`), `  },`]
      : []),
    `});`,
    "",
  ];

  return { path: options.layout.groupFile(group.name), content: lines.join("\n") };
}

/* The name a group's file imports a group inside it under. */
function innerLocal(group: ParsedGroup): string {
  return `${group.name}Group`;
}
