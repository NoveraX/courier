/**
 * Parses existing (potentially user-modified) group files for smart merge.
 *
 * Extracts imports, group metadata, endpoints, and non-endpoint code. The
 * endpoints are found by the file's syntax; the rest by its lines.
 */

import { endpointLines } from "./endpoint-lines";
import { findEndpointsBlock } from "./endpoints-block";
import { parseImports } from "./parse-imports";
import type { ExistingEndpointInfo, ExistingGroupInfo } from "./types";

const GROUP_RE = /^export\s+const\s+(\w+)\s*=\s*defineGroup\(\{/;
/** Opening line of the generated source, whichever shape it takes. */
const SOURCE_RE = /^export\s+const\s+\w+\s*=\s*define(?:Group|Api)\(\{/;
const PREFIX_RE = /prefix:\s*["']([^"']*)["']/;
/** Head a generated endpoint starts with, optionally qualified by its base. */
const DEFAULT_BASE = "endpoint";

export function parseExistingGroup(content: string): ExistingGroupInfo {
  const lines = content.split("\n");

  const imports = parseImports(lines);
  const { groupName, prefix } = parseGroupMeta(lines);
  const preamble = extractPreamble(lines);
  const baseName = readBaseName(preamble, "endpoint") ?? DEFAULT_BASE;
  const endpoints = parseEndpointsWithComments(content, lines);
  const trailingCode = extractTrailingCode(lines);
  const { header, footer } = extractShell(lines);
  const streamBaseName = readBaseName(preamble, "stream");

  return {
    groupName,
    prefix,
    header,
    footer,
    baseName,
    streamBaseName,
    imports,
    endpoints,
    preamble,
    trailingCode,
  };
}

function parseGroupMeta(lines: string[]): { groupName: string; prefix: string } {
  let groupName = "";
  let prefix = "";

  for (const line of lines) {
    const gm = line.match(GROUP_RE);
    if (gm?.[1]) groupName = gm[1];
    const pm = line.match(PREFIX_RE);
    if (pm?.[1]) prefix = pm[1];
    if (groupName && prefix) break;
  }

  return { groupName, prefix };
}

/* Each endpoint's lines and the doc comment above it, found by the file's syntax. */
function parseEndpointsWithComments(content: string, lines: string[]): ExistingEndpointInfo[] {
  return endpointLines(content).map(({ name, commentStart, start, end }) => ({
    name,
    code: lines.slice(start, end + 1).join("\n"),
    comment: commentStart < start ? lines.slice(commentStart, start).join("\n") : undefined,
  }));
}

/**
 * Read how the file names a builder its definitions start from.
 *
 * A destructuring may have been renamed, or the base kept whole and reached
 * through — either way, that name is what the merged endpoints must use.
 * `null` when the file names no such builder.
 */
function readBaseName(preamble: string[], builder: "endpoint" | "stream"): string | null {
  for (const line of preamble) {
    const destructured = line.match(/const\s*\{([^}]*)\}\s*=\s*\w*courier/i);
    if (destructured?.[1]) {
      for (const part of destructured[1].split(",")) {
        const [name, alias] = part.split(":").map((x) => x.trim());
        if (name === builder) return alias || name;
      }
      continue;
    }
    const whole = line.match(/const\s+(\w+)\s*=\s*courier\(/);
    if (whole?.[1]) return `${whole[1]}.${builder}`;
  }
  return null;
}

/**
 * Split the declaration into what surrounds its endpoints.
 *
 * A group and a flat source differ in everything but this shape, so both are
 * merged by keeping what the file already said and replacing only the
 * endpoints between.
 */
function extractShell(lines: string[]): { header: string[]; footer: string[] } {
  const block = findEndpointsBlock(lines);
  if (block === null) return { header: [], footer: [] };
  return {
    header: lines.slice(block.declaration, block.open + 1),
    footer: lines.slice(block.close, block.end + 1),
  };
}

/**
 * Extract the code between the imports and the source declaration.
 *
 * This is where the builder heads are named, so a file that was hand-edited to
 * rename or configure its base keeps that line through a merge.
 */
function extractPreamble(lines: string[]): string[] {
  const declarationIdx = lines.findIndex((l) => SOURCE_RE.test(l));
  if (declarationIdx === -1) return [];

  let lastImportIdx = -1;
  for (let i = 0; i < declarationIdx; i++) {
    if ((lines[i] ?? "").startsWith("import")) lastImportIdx = i;
  }

  return lines.slice(lastImportIdx + 1, declarationIdx).filter((line) => line.trim() !== "");
}

/**
 * Extract the code that follows the source declaration.
 *
 * The end of the declaration is found by balancing brackets from where it
 * opens rather than by looking for the first line that closes one: a base
 * configured across several lines closes one of its own above it.
 */
function extractTrailingCode(lines: string[]): string[] {
  const start = lines.findIndex((l) => SOURCE_RE.test(l));
  if (start === -1) return [];

  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const ch of line) {
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    if (depth <= 0) {
      return lines.slice(i + 1).filter((l) => l.trim() !== "");
    }
  }

  return [];
}
