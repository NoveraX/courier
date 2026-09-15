/**
 * Parses existing (potentially user-modified) group files for smart merge.
 *
 * Extracts imports, group metadata, endpoints, and non-endpoint code
 * using regex + bracket-depth tracking (no TS compiler dependency).
 */

import type { ExistingEndpointInfo, ExistingGroupInfo, ParsedImport } from "./types";

const NAMED_IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/;
const NS_IMPORT_RE = /^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/;
const GROUP_RE = /^export\s+const\s+(\w+)\s*=\s*defineGroup\(\{/;
const PREFIX_RE = /prefix:\s*["']([^"']*)["']/;
/** Head a generated endpoint starts with, optionally qualified by its base. */
const ENDPOINT_RE = /^\s{4}(\w+):\s*(?:\w+\.)?(?:query|mutation|stream|channel)\b/;
const JSDOC_RE = /^\s{4}\/\*\*/;

export function parseExistingGroup(content: string): ExistingGroupInfo {
  const lines = content.split("\n");

  const imports = parseImports(lines);
  const { groupName, prefix } = parseGroupMeta(lines);
  const endpoints = parseEndpointsWithComments(lines);
  const trailingCode = extractTrailingCode(lines);

  return { groupName, prefix, imports, endpoints, trailingCode };
}

function parseImports(lines: string[]): ParsedImport[] {
  const result: ParsedImport[] = [];

  for (const line of lines) {
    if (!line.startsWith("import")) {
      if (line.trim() === "" && result.length > 0) break;
      continue;
    }

    const nsMatch = line.match(NS_IMPORT_RE);
    if (nsMatch?.[1] && nsMatch[2]) {
      result.push({
        raw: line,
        source: nsMatch[2],
        names: [],
        typeNames: [],
        namespaceImport: nsMatch[1],
      });
      continue;
    }

    const namedMatch = line.match(NAMED_IMPORT_RE);
    if (!namedMatch?.[1] || !namedMatch[2]) {
      result.push({ raw: line, source: "", names: [], typeNames: [] });
      continue;
    }

    const specifiers = namedMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const names: string[] = [];
    const typeNames: string[] = [];

    for (const s of specifiers) {
      if (s.startsWith("type ")) typeNames.push(s.slice(5));
      else names.push(s);
    }

    result.push({ raw: line, source: namedMatch[2], names, typeNames });
  }

  return result;
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

function parseEndpointsWithComments(lines: string[]): ExistingEndpointInfo[] {
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

    const match = lines[i]?.match(ENDPOINT_RE);
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

/** Extract code after the closing `});` of defineGroup */
function extractTrailingCode(lines: string[]): string[] {
  const groupEndIdx = lines.findIndex((l) => /^\}\);?\s*$/.test(l));
  if (groupEndIdx === -1) return [];

  const trailing = lines.slice(groupEndIdx + 1).filter((l) => l.trim() !== "");
  return trailing;
}
