/**
 * Generates the source file (defineApi) and auth headers.
 */

import type { ParsedGroup, ParsedSecurityScheme, ParsedSpec } from "../parser/types";
import type { GeneratedFile, GenerateOptions } from "./types";

export function generateSourceFile(
  groups: ParsedGroup[],
  spec: ParsedSpec,
  options: GenerateOptions,
): GeneratedFile {
  const lines: string[] = [];

  lines.push(`import { defineApi } from "@noverax/nexus/define";`);

  for (const group of groups) {
    lines.push(`import { ${group.name} } from "./${group.name}";`);
  }

  lines.push("");
  lines.push(`export const ${options.sourceName} = defineApi({`);
  lines.push(`  baseURL: "${spec.baseURL}",`);

  // Generate auth headers from security schemes
  if (options.addAuthMiddleware && spec.securitySchemes.length > 0) {
    const authHeaders = generateAuthHeaders(spec.securitySchemes, options.sourceName);
    if (authHeaders.length > 0) {
      lines.push(`  headers: {`);
      for (const header of authHeaders) {
        lines.push(`    ${header},`);
      }
      lines.push(`  },`);
    }
  }

  if (groups.length > 0) {
    lines.push(`  groups: {`);
    for (const group of groups) {
      if (options.includeComments && group.description) {
        lines.push(`    /** ${group.description} */`);
      }
      lines.push(`    ${group.name},`);
    }
    lines.push(`  },`);
  }
  lines.push(`});`);
  lines.push("");

  return {
    path: `${options.outputDir}/source.ts`,
    content: lines.join("\n"),
  };
}

// ── Auth headers ─────────────────────────────────────────────────────────

function generateAuthHeaders(schemes: ParsedSecurityScheme[], sourceName: string): string[] {
  const envPrefix = sourceName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const headers: string[] = [];

  for (const scheme of schemes) {
    switch (scheme.type) {
      case "bearer":
        headers.push(`Authorization: \`Bearer \${process.env.${envPrefix}_TOKEN}\``);
        break;
      case "basic":
        headers.push(`Authorization: \`Basic \${process.env.${envPrefix}_CREDENTIALS}\``);
        break;
      case "apiKey":
        if (scheme.in === "header" && scheme.paramName) {
          headers.push(`"${scheme.paramName}": process.env.${envPrefix}_API_KEY ?? ""`);
        }
        break;
      case "oauth2":
        headers.push(`Authorization: \`Bearer \${process.env.${envPrefix}_ACCESS_TOKEN}\``);
        break;
    }
    // Only use the first auth scheme
    break;
  }

  return headers;
}
