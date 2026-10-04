import type { ImportDeclaration, Program } from "oxc-parser";
import type { ConfigImportForm } from "./config-import-form";
import { exportName } from "./export-name";
import { isValueImport } from "./is-value-import";
import { isValueSpecifier } from "./is-value-specifier";

/** A local name the config's default export is bound to, and the specifier it is imported by. */
export interface ConfigLocal {
  name: string;
  specifier: string;
}

/**
 * Every local name a module binds the config's default export to, through
 * a value import: `import config from` or `import { default as config } from`.
 * A type-only import names the type, not the object, so it does not count.
 *
 * @param program - The parsed module
 * @param accepted - The specifiers that import the config
 * @returns The local names with the specifier of each, in source order
 *
 * @example
 * ```ts
 * // import cfg from "./courier.config";
 * findConfigLocals(program, ["./courier.config"]); // → [{ name: "cfg", specifier: "./courier.config" }]
 * ```
 */
export function findConfigLocals(
  program: Program,
  accepted: readonly string[],
  form: ConfigImportForm = "default",
): ConfigLocal[] {
  const locals: ConfigLocal[] = [];
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || !isValueImport(statement)) continue;
    const specifier = statement.source.value;
    if (!accepted.includes(specifier)) continue;
    const name = form === "namespace" ? namespaceLocal(statement) : defaultLocal(statement);
    if (name !== null) locals.push({ name, specifier });
  }
  return locals;
}

function namespaceLocal(declaration: ImportDeclaration): string | null {
  const [specifier] = declaration.specifiers;
  return specifier?.type === "ImportNamespaceSpecifier" ? specifier.local.name : null;
}

function defaultLocal(declaration: ImportDeclaration): string | null {
  for (const specifier of declaration.specifiers) {
    if (specifier.type === "ImportDefaultSpecifier") return specifier.local.name;
    const named = specifier.type === "ImportSpecifier" && isValueSpecifier(specifier);
    if (named && exportName(specifier.imported) === "default") return specifier.local.name;
  }
  return null;
}
