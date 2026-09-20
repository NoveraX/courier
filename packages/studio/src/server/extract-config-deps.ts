import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import { createLogger } from "@noverax/courier";

import type ts from "typescript";

const log = createLogger("Studio");
const requireFrom = createRequire(import.meta.url);

/** Resolved once: the compiler if the project has one, `null` if it does not. */
let compiler: typeof ts | null | undefined;

/**
 * TypeScript is an optional peer — a JavaScript-only project is entitled not to
 * have it — so it is resolved at first use rather than imported at module load,
 * where its absence would take down every Studio entry point.
 */
function loadCompiler(): typeof ts | null {
  if (compiler !== undefined) return compiler;

  let loaded: typeof ts | null = null;
  try {
    loaded = requireFrom("typescript") as typeof ts;
  } catch {
    /* Resolved below with the same message as an unusable compiler. */
  }

  /* TypeScript 7 publishes no parser under the package root. */
  compiler = typeof loaded?.createSourceFile === "function" ? loaded : null;
  if (!compiler) {
    log.warn(
      "No usable TypeScript parser, so only the config file itself is watched — " +
        "edits to the modules it imports will not reload it.",
    );
  }
  return compiler;
}

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
 * transitively imports. Bare specifiers (`@noverax/courier`, `node:fs`, …) are
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
  const api = loadCompiler();
  if (!api) return null;
  return api.createSourceFile(file, text, api.ScriptTarget.Latest, true, api.ScriptKind.TS);
}

/** Collect every static import/export specifier (string literal) from a SourceFile */
function collectImportSpecifiers(source: ts.SourceFile): string[] {
  const out: string[] = [];
  const api = loadCompiler();
  if (!api) return out;

  const visit = (node: ts.Node): void => {
    if (
      (api.isImportDeclaration(node) || api.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      api.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier.text);
    } else if (
      api.isCallExpression(node) &&
      node.expression.kind === api.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && api.isStringLiteral(arg)) out.push(arg.text);
    }
    api.forEachChild(node, visit);
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
