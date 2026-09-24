import type { ImportDeclaration } from "oxc-parser";
import { MOCK_PACKAGE } from "../mock-package";
import { MocksEditRefusal } from "../mocks-edit-refusal";
import type { TextEdit } from "../types";
import type { ConfigSpecifiers } from "./config-specifiers";
import { importDeclaration } from "./import-declaration";
import { planImportLines } from "./import-lines";
import { planImportJoin } from "./join-import";
import { lineNumberAt } from "./line-number-at";
import type { MockImports } from "./mock-imports";
import type { ModuleBindings } from "./module-bindings";
import { collectModuleBindings } from "./module-bindings";
import type { ParsedSource } from "./parse-source";
import type { CalleeResolution } from "./resolve-callee";
import { resolveCallee } from "./resolve-callee";
import { resolveConfigImport } from "./resolve-config-import";
import type { ExtendedImport, FileStyle } from "./types";

/** The imports an edit adds, and the names its entries use. */
export interface ImportPlan {
  serverCallee: string;
  /** `defineMocks` as the file calls it, when the edit writes a default export. */
  mocksCallee: string | null;
  configLocal: string;
  /** The specifier the file imports the config with once the edit is made. */
  configSpecifier: string;
  edits: TextEdit[];
  /** The import declarations added, exactly as inserted. */
  addedStatements: string[];
  extendedImport: ExtendedImport | null;
}

/** How the file reaches the mock package's functions, and which of them it must import. */
interface Callees {
  server: string;
  mocks: string | null;
  /** The functions not yet imported, in the order an import lists them. */
  missing: string[];
}

/** What importing the missing functions from the package adds. */
interface PackageImport {
  edits: TextEdit[];
  declarations: string[];
  extendedImport: ExtendedImport | null;
}

/**
 * Plan the imports a mocks file needs for its new entries: reuse what it
 * imports; add a missing mock-package name into an existing value import of
 * the package root, or on a new line; add the config's import on a new line.
 *
 * @param parsed - The parsed mocks file
 * @param imports - What it imports from the mock package
 * @param specifiers - How it imports the config
 * @param style - The file's style
 * @param needsDefineMocks - Whether the edit writes a default export
 * @returns The insertions, the names the entries use, and the specifier the config is imported by
 * @throws {MocksEditRefusal} `IMPORT_NAME_TAKEN` when a name the edit must import is bound to something else
 *
 * @example
 * ```ts
 * planImports(parsed, imports, specifiers, style, false).addedStatements;
 * // → [`import courierConfig from "./courier.config";`] for a file that imports defineMockServer only
 * ```
 */
export function planImports(
  parsed: ParsedSource,
  imports: MockImports,
  specifiers: ConfigSpecifiers,
  style: FileStyle,
  needsDefineMocks: boolean,
): ImportPlan {
  const bindings = collectModuleBindings(parsed.program);
  const callees = resolveCallees(parsed, imports, bindings, needsDefineMocks);
  const config = resolveConfigImport(parsed.program, bindings, specifiers);
  const mock = planPackageImport(parsed, imports.joinable, callees.missing, style);
  const clause = { defaultLocal: config.local };
  const configLine = config.add ? [importDeclaration(clause, config.specifier, style)] : [];
  const lines = planImportLines(parsed, [...mock.declarations, ...configLine], style);
  return {
    serverCallee: callees.server,
    mocksCallee: callees.mocks,
    configLocal: config.local,
    configSpecifier: config.specifier,
    edits: [...mock.edits, ...(lines ? [lines.edit] : [])],
    addedStatements: lines?.statements ?? [],
    extendedImport: mock.extendedImport,
  };
}

function resolveCallees(
  parsed: ParsedSource,
  imports: MockImports,
  bindings: ModuleBindings,
  needsDefineMocks: boolean,
): Callees {
  const server = resolveCallee("defineMockServer", imports, bindings);
  const mocks = needsDefineMocks ? resolveCallee("defineMocks", imports, bindings) : null;
  const missing = [mocks, server].flatMap((c) => (c?.kind === "free" ? [c.callee] : []));
  return {
    server: requireCallee("defineMockServer", server, parsed),
    mocks: mocks && requireCallee("defineMocks", mocks, parsed),
    missing,
  };
}

/* A missing name joins the braces of the package root's value import when
   the file has one whose braces are where the syntax puts them. */
function planPackageImport(
  parsed: ParsedSource,
  joinable: ImportDeclaration | null,
  missing: readonly string[],
  style: FileStyle,
): PackageImport {
  if (missing.length === 0) return { edits: [], declarations: [], extendedImport: null };
  const joined = joinable && planImportJoin(parsed, joinable, missing, style);
  if (joinable && joined) {
    return {
      edits: joined,
      declarations: [],
      extendedImport: { start: joinable.start, names: missing },
    };
  }
  const names = missing.map((name) => ({ imported: name, local: name }));
  return {
    edits: [],
    declarations: [importDeclaration({ names }, MOCK_PACKAGE, style)],
    extendedImport: null,
  };
}

function requireCallee(name: string, resolution: CalleeResolution, parsed: ParsedSource): string {
  if (resolution.kind !== "taken") return resolution.callee;
  const line = lineNumberAt(parsed.text, resolution.offset);
  throw new MocksEditRefusal(
    "IMPORT_NAME_TAKEN",
    `${parsed.fileName} already declares ${name} on line ${line}, so Studio cannot import ${name} from ${MOCK_PACKAGE} under that name.`,
  );
}
