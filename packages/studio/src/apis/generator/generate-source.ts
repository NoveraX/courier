/**
 * Generates the source file (defineApi) and auth headers.
 */

import type { ParsedGroup, ParsedSecurityScheme, ParsedSpec } from "../parser/types";
import { jsdocText } from "./jsdoc-text";
import { jsLiteral, objectKey } from "./literals";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

export function generateSourceFile(
  groups: ParsedGroup[],
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
): GeneratedFile {
  const lines: string[] = [];

  lines.push(`import { defineApi } from "@noverax/courier/define";`);

  for (const group of groups) {
    lines.push(`import { ${group.name} } from "./${group.name}";`);
  }

  lines.push("");
  lines.push(`export const ${options.sourceName} = defineApi({`);
  lines.push(`  baseURL: ${jsLiteral(spec.baseURL)},`);

  // Generate auth headers from security schemes
  const authHeaders =
    options.addAuthMiddleware && spec.securitySchemes.length > 0
      ? generateAuthHeaders(spec.securitySchemes, options.sourceName)
      : [];

  if (authHeaders.length > 0) {
    lines.push(`  headers: {`);
    for (const header of authHeaders) {
      lines.push(`    ${header},`);
    }
    lines.push(`  },`);
  }

  if (groups.length > 0) {
    lines.push(`  groups: {`);
    for (const group of groups) {
      if (options.includeComments && group.description) {
        lines.push(`    /** ${jsdocText(group.description)} */`);
      }
      lines.push(`    ${group.name},`);
    }
    lines.push(`  },`);
  }
  lines.push(`});`);
  lines.push("");

  if (authHeaders.length > 0) lines.push(...requiredEnvHelper());

  return {
    path: `${options.outputDir}/source.ts`,
    content: lines.join("\n"),
  };
}

// ── Auth headers ─────────────────────────────────────────────────────────

/**
 * The reader every generated auth header goes through.
 *
 * Interpolating `process.env.X` directly sent `Bearer undefined` when the
 * variable was unset — a request the API answers with 401 and no hint why.
 * A bundler makes it worse: Vite replaces `process.env` with `{}`, so the
 * value is always missing and always silent.
 */
function requiredEnvHelper(): string[] {
  return [
    "/**",
    " * Read a variable this client cannot work without.",
    " *",
    " * It is read once, when this module loads, so a missing one is reported",
    " * at startup rather than as a 401 on the first call.",
    " */",
    "function requireEnv(name: string): string {",
    "  /* Reached through globalThis so this file needs no Node type",
    "     definitions to compile in a project that has none. */",
    "  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };",
    "  const value = runtime.process?.env?.[name];",
    "  if (!value) {",
    "    throw new Error(",
    "      `${name} is not set. This client sends it on every request. Set it in",
    "the environment this module runs in — it reads the environment, so it",
    "belongs on a server rather than in a browser bundle.`,",
    "    );",
    "  }",
    "  return value;",
    "}",
    "",
  ];
}

function generateAuthHeaders(schemes: ParsedSecurityScheme[], sourceName: string): string[] {
  const envPrefix = sourceName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const headers: string[] = [];

  for (const scheme of schemes) {
    switch (scheme.type) {
      case "bearer":
        headers.push(`Authorization: \`Bearer \${requireEnv("${envPrefix}_TOKEN")}\``);
        break;
      case "basic":
        headers.push(`Authorization: \`Basic \${requireEnv("${envPrefix}_CREDENTIALS")}\``);
        break;
      case "apiKey":
        if (scheme.in === "header" && scheme.paramName) {
          headers.push(`${objectKey(scheme.paramName)}: requireEnv("${envPrefix}_API_KEY")`);
        }
        break;
      case "oauth2":
        headers.push(`Authorization: \`Bearer \${requireEnv("${envPrefix}_ACCESS_TOKEN")}\``);
        break;
    }
    // Only use the first auth scheme
    break;
  }

  return headers;
}
