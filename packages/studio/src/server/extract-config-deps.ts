import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import ts from "typescript";

/** Extensions resolved when an import has none — TS-first, then bundler outputs */
const RESOLVE_EXTENSIONS: ReadonlyArray<string> = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

/**
 * Walk a config file and return every local TypeScript/JavaScript module it
 * transitively imports. Bare specifiers (`@noverax/nexus`, `node:fs`, …) are
 * skipped — only relative and absolute file paths are followed. Cycles are
 * tolerated via a visited set.
 *
 * The result always contains `entryFile` as the first element so callers can
 * pass it directly to a watcher without an extra concat.
 */
export function extractConfigDeps(entryFile: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  const walk = (file: string): void => {
    const normalized = resolve(file);
    if (visited.has(normalized)) return;
    if (!existsSync(normalized)) return;
    visited.add(normalized);
    order.push(normalized);

    const source = readSourceFile(normalized);
    if (!source) return;

    for (const specifier of collectImportSpecifiers(source)) {
      if (!isLocalSpecifier(specifier)) continue;
      const resolved = resolveLocalImport(dirname(normalized), specifier);
      if (resolved) walk(resolved);
    }
  };

  walk(entryFile);
  return order;
}

/** Parse `file` into a TypeScript SourceFile, returning null on read failure */
function readSourceFile(file: string): ts.SourceFile | null {
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Collect every static import/export specifier (string literal) from a SourceFile */
function collectImportSpecifiers(source: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) out.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** True for relative or absolute file specifiers — false for bare/package specifiers */
function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || isAbsolute(specifier);
}

/**
 * Resolve a local import specifier against a base directory by trying:
 * the literal path, then each known extension, then `index.{ext}` for
 * directories. Returns the absolute resolved path or null on miss.
 */
function resolveLocalImport(baseDir: string, specifier: string): string | null {
  const candidate = isAbsolute(specifier) ? specifier : resolve(baseDir, specifier);
  const direct = tryExtensions(candidate);
  if (direct) return direct;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const indexed = tryExtensions(resolve(candidate, "index"));
    if (indexed) return indexed;
  }
  return null;
}

/** Try each known extension on `pathWithoutExt`, returning the first hit */
function tryExtensions(pathWithoutExt: string): string | null {
  if (existsSync(pathWithoutExt) && statSync(pathWithoutExt).isFile()) return pathWithoutExt;
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = pathWithoutExt + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
