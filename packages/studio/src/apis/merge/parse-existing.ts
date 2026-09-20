/**
 * Parses existing (potentially user-modified) group files for smart merge.
 *
 * Extracts imports, group metadata, endpoints, and non-endpoint code
 * using regex + bracket-depth tracking (no TS compiler dependency).
 */

import type { ExistingEndpointInfo, ExistingGroupInfo, ParsedImport } from "./types";

const NAMED_IMPORT_RE = /^import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["'];?\s*$/;
const NS_IMPORT_RE = /^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/;
const GROUP_RE = /^export\s+const\s+(\w+)\s*=\s*defineGroup\(\{/;
/** Opening line of the generated source, whichever shape it takes. */
const SOURCE_RE = /^export\s+const\s+\w+\s*=\s*define(?:Group|Api)\(\{/;
const PREFIX_RE = /prefix:\s*["']([^"']*)["']/;
/** Head a generated endpoint starts with, optionally qualified by its base. */
const ENDPOINT_RE = /^\s{4}(\w+):\s*(?:\w+\.)?(?:endpoint|stream|channel)\b/;
const JSDOC_RE = /^\s{4}\/\*\*/;

export function parseExistingGroup(content: string): ExistingGroupInfo {
  const lines = content.split("\n");

  const imports = parseImports(lines);
  const { groupName, prefix } = parseGroupMeta(lines);
  const endpoints = parseEndpointsWithComments(lines);
  const preamble = extractPreamble(lines);
  const trailingCode = extractTrailingCode(lines);
  const { header, footer } = extractShell(lines);

  return { groupName, prefix, header, footer, imports, endpoints, preamble, trailingCode };
}

function parseImports(lines: string[]): ParsedImport[] {
  const result: ParsedImport[] = [];

  for (const raw of importStatements(lines)) {
    const flat = raw.replace(/\s+/g, " ").trim();

    const nsMatch = flat.match(NS_IMPORT_RE);
    if (nsMatch?.[1] && nsMatch[2]) {
      result.push({
        raw,
        source: nsMatch[2],
        names: [],
        typeNames: [],
        namespaceImport: nsMatch[1],
      });
      continue;
    }

    const namedMatch = flat.match(NAMED_IMPORT_RE);
    if (!namedMatch?.[1] || !namedMatch[2]) {
      /* A default, mixed or side-effect import. It is kept as written, and
         keyed by its own text so two of them never collapse onto one another. */
      result.push({ raw, source: sourceOf(flat) ?? raw, names: [], typeNames: [] });
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

    result.push({ raw, source: namedMatch[2], names, typeNames });
  }

  return result;
}

/**
 * Gather each import statement, however many lines it spans.
 *
 * A long list of named imports is wrapped across lines by every formatter, so
 * reading one line at a time would leave those unparsed — and an unparsed
 * import has no source to merge on.
 */
function importStatements(lines: string[]): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let open = 0;

  for (const line of lines) {
    if (current.length === 0 && !/^\s*import\b/.test(line)) {
      if (line.trim() === "" && statements.length > 0) break;
      continue;
    }

    current.push(line);
    open += count(line, "{") - count(line, "}");
    if (open <= 0) {
      statements.push(current.join("\n"));
      current = [];
      open = 0;
    }
  }

  if (current.length > 0) statements.push(current.join("\n"));
  return statements;
}

function count(line: string, ch: string): number {
  let n = 0;
  for (const c of line) if (c === ch) n++;
  return n;
}

/** The module an import statement names, whatever shape the statement has. */
function sourceOf(statement: string): string | null {
  const match = statement.match(/from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/);
  return match ? (match[1] ?? match[2] ?? null) : null;
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

/**
 * Split the declaration into what surrounds its endpoints.
 *
 * A group and a flat source differ in everything but this shape, so both are
 * merged by keeping what the file already said and replacing only the
 * endpoints between.
 */
function extractShell(lines: string[]): { header: string[]; footer: string[] } {
  const start = lines.findIndex((l) => SOURCE_RE.test(l));
  if (start === -1) return { header: [], footer: [] };

  const opensEndpoints = lines.findIndex((l, i) => i >= start && /^\s*endpoints:\s*\{\s*$/.test(l));
  if (opensEndpoints === -1) return { header: [], footer: [] };

  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i] ?? "") {
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    if (depth <= 0) {
      /* The endpoints close one level in from the declaration. */
      const closesEndpoints = lines.findIndex(
        (l, j) => j > opensEndpoints && /^\s*\},?\s*$/.test(l),
      );
      return {
        header: lines.slice(start, opensEndpoints + 1),
        footer: lines.slice(closesEndpoints === -1 ? i : closesEndpoints, i + 1),
      };
    }
  }
  return { header: [], footer: [] };
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
