/**
 * Generates a flat source file with endpoints directly in defineApi.
 * Used when groupBy === "single".
 */

import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";
import { endpointContext } from "./endpoint-context";
import { endpointEntries } from "./endpoint-entries";
import { endpointImports } from "./endpoint-imports";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write the source of an import generated as one flat group: its endpoints
 * sit in `defineApi` itself.
 *
 * @param endpoints - Every endpoint, their types already extracted
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @param declared - The schemas the import's schemas module declares, by name
 * @param extracted - The types extracted from the endpoints, by name
 * @returns The source file
 * @example
 * ```ts
 * generateFlatSourceFile(processed.endpoints, spec, options, declared, extracted);
 * ```
 */
export function generateFlatSourceFile(
  endpoints: readonly ParsedEndpoint[],
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  declared: Readonly<Record<string, ParsedSchema>>,
  extracted: Readonly<Record<string, ParsedSchema>>,
): GeneratedFile {
  const context = endpointContext(spec, options, declared);
  const entries = endpointEntries(endpoints, context, extracted);

  const lines = [
    `import { courier, defineApi } from "@noverax/courier/define";`,
    ...endpointImports(context),
    "",
    "const { endpoint } = courier();",
    "",
    `export const ${options.sourceName} = defineApi({`,
    `  baseURL: "${spec.baseURL}",`,
    `  endpoints: {`,
    ...entries,
    `  },`,
    `});`,
    "",
  ];

  return { path: options.layout.sourceFile, content: lines.join("\n") };
}
