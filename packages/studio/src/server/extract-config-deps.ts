import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { createLogger } from "@noverax/courier";
import { readPathAliases } from "@noverax/courier-studio-core/runtime";

import type ts from "typescript";

import { resolveConfigImport } from "./resolve-config-import";

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

/**
 * Walk a config file and return every local TypeScript/JavaScript module it
 * transitively imports.
 *
 * Relative and absolute specifiers are followed directly; a bare one is
 * followed only when the project's tsconfig `paths` maps it to a file of its
 * own, which is how a config that imports `@/lib/sources` or `@shared/api`
 * still yields the modules behind those names. Everything else — a package, a
 * node builtin — is left alone. Cycles are tolerated via a visited set.
 *
 * The result always contains `entryFile` as the first element so callers can
 * pass it directly to a watcher without an extra concat.
 */
export function extractConfigDeps(entryFile: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const aliases = readPathAliases(dirname(resolve(entryFile)));

  const walk = (file: string): void => {
    const normalized = resolve(file);
    if (visited.has(normalized)) return;
    if (!existsSync(normalized)) return;
    visited.add(normalized);
    order.push(normalized);

    const source = readSourceFile(normalized);
    if (!source) return;

    for (const specifier of collectImportSpecifiers(source)) {
      const resolved = resolveConfigImport(dirname(normalized), specifier, aliases);
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
