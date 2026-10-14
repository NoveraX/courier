import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
import { parseSource } from "@noverax/courier-cli/devkit";
import { type PathAliases, readPathAliases } from "@noverax/courier-studio-core/config";
import type { ObjectExpression, Program } from "oxc-parser";
import { exportName } from "../mocks-edit/plan/export-name";
import { propertyKeyName } from "../mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../mocks-edit/plan/unwrap-expression";
import { resolveConfigImport } from "../resolve-config-import";
import { insideProject } from "./inside-project";
import { locateConfigObject } from "./locate-config-object";
import { topLevelConst } from "./top-level-const";

/** The module a config takes its `sources` from, as the guides lay a project out. */
export interface SourcesModule {
  /** Its absolute path, links resolved. */
  path: string;
  /** Its path relative to the project root, with `/`. */
  file: string;
  /** The name the config imports it by: `sources`, or `default` for a default import. */
  exportName: string;
}

/**
 * The module the config object takes `sources` from, when the config does
 * not write the list itself: `import { sources } from "./lib/sources"` —
 * by a relative path or a tsconfig path alias — then `sources` in the
 * config object. Followed only to a module of the project; a list the
 * config writes, or a `const` it declares, is the config's own.
 *
 * @param program - The parsed config
 * @param config - The object the config exports
 * @param configPath - The config's absolute path, links resolved
 * @param root - The project root, links resolved
 * @param aliases - The project's path aliases; read from its tsconfig when absent
 * @returns The module, or `undefined` when the config writes `sources` itself or names no such module
 * @example
 * ```ts
 * // courier.config.ts: import { sources } from "./lib/sources"; export default defineConfig({ sources });
 * sourcesModuleOf(program, config, "/app/courier.config.ts", "/app");
 * // → { path: "/app/lib/sources.ts", file: "lib/sources.ts", exportName: "sources" }
 * ```
 */
export function sourcesModuleOf(
  program: Program,
  config: ObjectExpression,
  configPath: string,
  root: string,
  aliases?: PathAliases,
): SourcesModule | undefined {
  const local = sourcesName(config);
  if (local === undefined || topLevelConst(program, local) !== null) return undefined;
  const imported = importOf(program, local);
  if (imported === undefined) return undefined;
  const found = resolveConfigImport(
    dirname(configPath),
    imported.specifier,
    aliases ?? readPathAliases(root),
  );
  if (found.file === null) return undefined;
  const path = realpathSync(found.file);
  if (!insideProject(root, path)) return undefined;
  return { path, file: relative(root, path).split(sep).join("/"), exportName: imported.name };
}

/**
 * The module the config takes its `sources` from, read from the config on
 * disk: {@link sourcesModuleOf} for the file that holds the config's object.
 *
 * @param configPath - The file that holds the config's object, absolute, links resolved
 * @param root - The project root, links resolved
 * @returns The module, or `undefined` when the config writes `sources` itself — or cannot be read, which the change then says
 * @example
 * ```ts
 * sourcesModuleFor("/app/courier.config.ts", "/app")?.file; // → "lib/sources.ts"
 * ```
 */
export function sourcesModuleFor(configPath: string, root: string): SourcesModule | undefined {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    /* The read that plans the change says what is wrong with the config. */
    return undefined;
  }
  const parsed = parseSource(configPath, text);
  if (parsed.problem !== null) return undefined;
  const located = locateConfigObject(parsed.program);
  if (located.kind !== "object") return undefined;
  return sourcesModuleOf(parsed.program, located.object, configPath, root);
}

/* The name the config object writes as its `sources`: `{ sources }` or `{ sources: list }`. */
function sourcesName(config: ObjectExpression): string | undefined {
  for (const property of config.properties) {
    if (property.type !== "Property" || property.computed || property.kind !== "init") continue;
    if (propertyKeyName(property.key) !== "sources") continue;
    const value = unwrapExpression(property.value);
    return value.type === "Identifier" ? value.name : undefined;
  }
  return undefined;
}

/* The value import that binds `local`, and the name the module exports it under. */
function importOf(
  program: Program,
  local: string,
): { specifier: string; name: string } | undefined {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
    for (const specifier of statement.specifiers) {
      if (specifier.local.name !== local) continue;
      if (specifier.type === "ImportDefaultSpecifier") {
        return { specifier: statement.source.value, name: "default" };
      }
      if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
        return { specifier: statement.source.value, name: exportName(specifier.imported) };
      }
      return undefined;
    }
  }
  return undefined;
}
