import type { ParsedImport } from "./types";

const NAMED_IMPORT_RE = /^import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["'];?\s*$/;
const NS_IMPORT_RE = /^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/;

/**
 * The import statements at the top of a generated group file, each with the
 * module it reads and the names it binds, types apart.
 *
 * @param lines - The file's lines
 * @returns One entry per import statement, in order; a default, mixed or
 *   side-effect import is kept as written
 * @example
 * ```ts
 * parseImports(['import { z } from "zod";']); // → [{ raw: 'import { z } from "zod";', source: "zod", names: ["z"], typeNames: [] }]
 * ```
 */
export function parseImports(lines: string[]): ParsedImport[] {
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
