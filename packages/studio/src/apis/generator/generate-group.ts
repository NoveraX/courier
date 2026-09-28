/**
 * Generates group definition files (defineGroup + endpoints).
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { endpointContext } from "./endpoint-context";
import { endpointEntries } from "./endpoint-entries";
import { endpointImports } from "./endpoint-imports";
import { jsLiteral } from "./literals";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write a group's file: its endpoints, and the imports they use.
 *
 * @param group - The group, its endpoints' types already extracted
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @param declared - The schemas the group's schemas module declares, by name
 * @param extracted - The types extracted from the group's endpoints, by name
 * @returns The file, at the path the layout gives the group
 * @example
 * ```ts
 * generateGroupFile(processed, spec, options, buildSchemaRecord(processed, spec, extracted), extracted);
 * ```
 */
export function generateGroupFile(
  group: ParsedGroup,
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  declared: Readonly<Record<string, ParsedSchema>>,
  extracted: Readonly<Record<string, ParsedSchema>>,
): GeneratedFile {
  const context = endpointContext(spec, options, declared);
  const entries = endpointEntries(group.endpoints, context, extracted);

  const lines = [
    `import { courier, defineGroup } from "@noverax/courier/define";`,
    ...endpointImports(context),
    "",
    "const { endpoint } = courier();",
    "",
    `export const ${group.name} = defineGroup({`,
    `  prefix: ${jsLiteral(group.prefix)},`,
    `  endpoints: {`,
    ...entries,
    `  },`,
    `});`,
    "",
  ];

  return { path: options.layout.groupFile(group.name), content: lines.join("\n") };
}
