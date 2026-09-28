/**
 * Parses existing (potentially user-modified) group files for smart merge.
 *
 * Extracts imports, group metadata, endpoints, and non-endpoint code
 * using regex + bracket-depth tracking (no TS compiler dependency).
 */

import { findEndpointsBlock } from "./endpoints-block";
import { parseImports } from "./parse-imports";
import type { ExistingEndpointInfo, ExistingGroupInfo } from "./types";

const GROUP_RE = /^export\s+const\s+(\w+)\s*=\s*defineGroup\(\{/;
/** Opening line of the generated source, whichever shape it takes. */
const SOURCE_RE = /^export\s+const\s+\w+\s*=\s*define(?:Group|Api)\(\{/;
const PREFIX_RE = /prefix:\s*["']([^"']*)["']/;
/** Head a generated endpoint starts with, optionally qualified by its base. */
const DEFAULT_BASE = "endpoint";

/**
 * Line opening an endpoint, in whichever name this file gives the base.
 *
 * `stream` and `channel` are always recognised: a person may have added one by
 * hand even though nothing generates them.
 */
function endpointStart(baseName: string): RegExp {
  const base = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s{4}(\\w+):\\s*(?:${base}|(?:\\w+\\.)?(?:endpoint|stream|channel))\\b`);
}
const JSDOC_RE = /^\s{4}\/\*\*/;

export function parseExistingGroup(content: string): ExistingGroupInfo {
  const lines = content.split("\n");

  const imports = parseImports(lines);
  const { groupName, prefix } = parseGroupMeta(lines);
  const preamble = extractPreamble(lines);
  const baseName = readBaseName(preamble, "endpoint") ?? DEFAULT_BASE;
  const endpoints = parseEndpointsWithComments(lines, baseName);
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

function parseEndpointsWithComments(lines: string[], baseName: string): ExistingEndpointInfo[] {
  const startsEndpoint = endpointStart(baseName);
  const result: ExistingEndpointInfo[] = [];
  let i = 0;

  while (i < lines.length) {
    let comment: string | undefined;

    if (JSDOC_RE.test(lines[i] ?? "")) {
      const commentStart = i;
      while (i < lines.length && !lines[i]?.includes("*/")) i++;
      comment = lines.slice(commentStart, i + 1).join("\n");
      i++;
    }

    const match = lines[i]?.match(startsEndpoint);
    if (!match?.[1]) {
      if (comment) comment = undefined;
      i++;
      continue;
    }

    const name = match[1];
    const endLine = findEndpointEnd(lines, i);
    const code = lines.slice(i, endLine + 1).join("\n");
    result.push({ name, code, comment });
    i = endLine + 1;
  }

  return result;
}

function findEndpointEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;

  for (let j = startLine; j < lines.length; j++) {
    for (const ch of lines[j] ?? "") {
      if (ch === "(" || ch === "{" || ch === "[") {
        depth++;
        foundOpen = true;
      }
      if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    if (foundOpen && depth <= 0) return j;
  }

  return lines.length - 1;
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
