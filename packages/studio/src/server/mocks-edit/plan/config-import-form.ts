import { parseSource } from "@noverax/courier-cli/devkit";
import type { Program } from "oxc-parser";
import { exportName } from "./export-name";

/** How the mocks file imports the config: its default export, or its module whole. */
export type ConfigImportForm = "default" | "namespace";

type Statement = Program["body"][number];

/**
 * How a mocks file imports the config Studio loads.
 *
 * Studio reads a config without a default export as the module whole, so a
 * config of named exports is one — and `import config from` it fails the
 * project's own type check (TS1192). Such a config is imported as a
 * namespace; a config with a default export, or a CommonJS one whose
 * `module.exports` is its default, by its default. A config Studio did not
 * read, or one that does not parse, keeps the default form.
 *
 * @param configName - The config's file name, whose extension picks the language
 * @param configText - The config's text, or `null` when it was not read
 * @returns The form the import takes
 * @example
 * ```ts
 * configImportForm("courier.config.ts", "export const sources = { api }"); // → "namespace"
 * configImportForm("courier.config.ts", "export default { sources: { api } }"); // → "default"
 * ```
 */
export function configImportForm(configName: string, configText: string | null): ConfigImportForm {
  if (configText === null) return "default";
  const { program, problem } = parseSource(configName, configText);
  if (problem !== null) return "default";
  const { body } = program;
  if (!body.some(isModuleSyntax) || body.some(exportsDefault)) return "default";
  return "namespace";
}

function isModuleSyntax(statement: Statement): boolean {
  return (
    statement.type === "ImportDeclaration" ||
    statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration" ||
    statement.type === "ExportAllDeclaration"
  );
}

function exportsDefault(statement: Statement): boolean {
  if (statement.type === "ExportDefaultDeclaration") return true;
  if (statement.type !== "ExportNamedDeclaration") return false;
  return statement.specifiers.some((specifier) => exportName(specifier.exported) === "default");
}
