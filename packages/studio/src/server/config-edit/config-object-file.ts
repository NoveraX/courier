import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import type { PathAliases } from "@noverax/courier-studio-core/config";
import type { Program } from "oxc-parser";

import { parseSource } from "../mocks-edit/plan/parse-source";
import { resolveConfigImport } from "../resolve-config-import";

/* A longer chain is no layout a person writes; Studio edits the file it got to. */
const MAX_HOPS = 4;

/* Only relative specifiers are followed, which no path alias names. */
const NO_ALIASES: PathAliases = { loader: {}, candidatesFor: () => [] };

interface Named {
  type: string;
  name?: string;
  value?: unknown;
}

function nameOf(node: Named): string | undefined {
  return node.type === "Literal" ? String(node.value) : node.name;
}

/* The module whose default export the file passes on: `export { default } from "./x"`, or `import c from "./x"` and `export default c`. */
function passedOnFrom(program: Program): string | undefined {
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.source === null) continue;
    const forwards = statement.specifiers.some(
      (specifier) =>
        nameOf(specifier.exported as Named) === "default" &&
        nameOf(specifier.local as Named) === "default",
    );
    if (forwards) return statement.source.value;
  }
  const exported = program.body.find((statement) => statement.type === "ExportDefaultDeclaration");
  if (exported?.type !== "ExportDefaultDeclaration") return undefined;
  if (exported.declaration.type !== "Identifier") return undefined;
  const local = exported.declaration.name;
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const imports = statement.specifiers.some(
      (specifier) => specifier.type === "ImportDefaultSpecifier" && specifier.local.name === local,
    );
    if (imports) return statement.source.value;
  }
  return undefined;
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    /* The read that edits the file says what is wrong with it. */
    return undefined;
  }
}

function insideProject(root: string, file: string): boolean {
  const path = relative(root, file);
  return (
    path !== "" &&
    !path.startsWith("..") &&
    !isAbsolute(path) &&
    !path.split(sep).includes("node_modules")
  );
}

/**
 * The file that holds the config's object: the config itself — or, where
 * it passes another module's default export on, as a server whose
 * TypeScript compiles `src/` alone has it pass on `src/courier/config.ts`,
 * that module, followed within the project. Studio adds to a list where
 * the list is written, so an app that imports the module registers what
 * Studio declares.
 *
 * @param configPath - The config Studio loaded, absolute, links resolved
 * @param root - The project root, links resolved
 * @returns The file to edit, absolute
 * @example
 * ```ts
 * // courier.config.ts: export { default } from "./src/courier/config";
 * configObjectFile("/app/courier.config.ts", "/app"); // → "/app/src/courier/config.ts"
 * ```
 */
export function configObjectFile(configPath: string, root: string): string {
  let current = configPath;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const text = readText(current);
    if (text === undefined) return current;
    const parsed = parseSource(current, text);
    const specifier = parsed.problem === null ? passedOnFrom(parsed.program) : undefined;
    if (specifier === undefined || !specifier.startsWith(".")) return current;
    const { file } = resolveConfigImport(dirname(current), specifier, NO_ALIASES);
    const next = file === null ? undefined : realpathSync(file);
    if (next === undefined || next === current || !insideProject(root, next)) return current;
    current = next;
  }
  return current;
}
