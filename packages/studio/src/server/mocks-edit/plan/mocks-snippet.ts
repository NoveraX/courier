import { MOCK_PACKAGE } from "../mock-package";
import { findCommonJsExport } from "./commonjs-export";
import { configSpecifiers } from "./config-specifiers";
import { findDefaultExport } from "./default-export";
import { detectStyle } from "./detect-style";
import { draftMocksEdit } from "./draft-mocks-edit";
import { firstFreeName } from "./first-free-name";
import type { ImportedName } from "./import-declaration";
import { importDeclaration } from "./import-declaration";
import { importsCarryExtensions } from "./imports-carry-extensions";
import type { MockImports } from "./mock-imports";
import { readMockImports } from "./mock-imports";
import { mocksExport } from "./mocks-export";
import type { ModuleBindings } from "./module-bindings";
import { collectModuleBindings } from "./module-bindings";
import type { ParsedSource } from "./parse-source";
import { parseSource } from "./parse-source";
import { readEditable } from "./read-editable";
import { renderEntry } from "./render-entry";
import { resolveCallee } from "./resolve-callee";
import { resolveConfigImport } from "./resolve-config-import";
import type { EntryContext, PlanInput } from "./types";

/** The names a snippet writes, and the import lines that bring in those the file lacks. */
interface SnippetNames {
  ctx: EntryContext;
  /** `defineMocks` as the snippet calls it, when it writes the default export. */
  mocksCallee: string | null;
  declarations: string[];
}

/** What the snippet can tell about the file it is for. */
interface SnippetShape {
  /** Whether the file has no default export, so the snippet writes one. */
  appends: boolean;
  /** Whether the file's imports were read, so the snippet lists only those it lacks. */
  importsKnown: boolean;
}

/**
 * Write what to add by hand when Studio does not make the edit itself.
 *
 * With no mocks file, it is the whole file the planner would create. For a
 * file that parses, it is the imports the file lacks — under the names the
 * planner would use, or a free alias where a name is taken — then a comment
 * naming the file and where the rest goes: the entries, inside
 * `defineMocks({ ... })`; or, in a file without a default export, the
 * `export default defineMocks({ ... })` statement the planner would append.
 * A file whose only default export is a type gets the entries alone, as
 * TypeScript allows no second default export beside it. For a file that
 * does not parse, or that Studio did not read, its imports are unknown: both
 * imports under their default names follow a comment asking for those it
 * does not have yet, then the entries. It never throws, and never reads
 * `mocks:`: courier.config has no `mocks` key and refuses one, so a snippet
 * must never look like it declares mocks there.
 *
 * @param input - The files and the mocks to declare, as given to the planner
 * @returns The snippet, ending with a line break
 *
 * @example
 * ```ts
 * buildMocksSnippet({ existing: { name: "courier.mocks.ts", text }, ...rest });
 * // import courierConfig from "./courier.config";
 * //
 * // // courier.mocks.ts, inside defineMocks({ ... })
 * //   api: defineMockServer({ source: courierConfig.sources.api }),
 * ```
 */
export function buildMocksSnippet(input: PlanInput): string {
  const { existing } = input;
  if (existing === null)
    return draftMocksEdit(readEditable(input.createName, ""), input, true).text;
  const parsed = existing.text === null ? null : parseSource(existing.name, existing.text);
  /* What Studio could not read is written for as a file that binds and
     imports nothing and already exports the mocks object. */
  if (parsed === null || parsed.problem !== null) {
    const shape = { appends: false, importsKnown: false };
    return partSnippet(parseSource(existing.name, ""), input, shape);
  }
  const { program } = parsed;
  const appends = findDefaultExport(program) === null && findCommonJsExport(program) === null;
  return partSnippet(parsed, input, { appends, importsKnown: true });
}

function partSnippet(parsed: ParsedSource, input: PlanInput, shape: SnippetShape): string {
  const { ctx, mocksCallee, declarations } = snippetNames(parsed, input, shape.appends);
  const { eol, indent } = ctx.style;
  const head = importsHead(parsed.fileName, declarations, shape.importsKnown, eol);
  const entries = input.requests.map((request) => renderEntry(request, ctx, indent, true));
  if (mocksCallee !== null) {
    const statement = mocksExport(mocksCallee, entries, ctx.style);
    return `${head}// ${parsed.fileName}, at the end${eol}${statement}${eol}`;
  }
  const lines = entries.map((entry) => `${indent}${entry},${eol}`).join("");
  return `${head}// ${parsed.fileName}, inside defineMocks({ ... })${eol}${lines}`;
}

/* When the file's imports are unknown, the lines are only the ones it may
   lack: pasting an import the file already has declares its names twice. */
function importsHead(
  fileName: string,
  declarations: readonly string[],
  importsKnown: boolean,
  eol: string,
): string {
  if (declarations.length === 0) return "";
  const lines = declarations.map((line) => line + eol).join("");
  const ask = importsKnown ? "" : `// Add the imports ${fileName} does not have yet:${eol}`;
  return `${ask}${lines}${eol}`;
}

function snippetNames(parsed: ParsedSource, input: PlanInput, appends: boolean): SnippetNames {
  const { program } = parsed;
  const style = detectStyle(parsed);
  const bindings = collectModuleBindings(program);
  const imports = readMockImports(program);
  const explicit = input.explicitExtensions || importsCarryExtensions(program);
  const specifiers = configSpecifiers(input.configName, explicit);
  const missing: ImportedName[] = [];
  const mocksCallee = appends ? calleeFor("defineMocks", imports, bindings, missing) : null;
  const serverCallee = calleeFor("defineMockServer", imports, bindings, missing);
  const config = resolveConfigImport(program, bindings, specifiers);
  const declarations =
    missing.length === 0 ? [] : [importDeclaration({ names: missing }, MOCK_PACKAGE, style)];
  if (config.add) {
    declarations.push(importDeclaration({ defaultLocal: config.local }, config.specifier, style));
  }
  const ctx = { serverCallee, configLocal: config.local, style, guardMocksColon: true };
  return { ctx, mocksCallee, declarations };
}

/* A name that is taken is imported under the first free alias, so the
   snippet still works when pasted in. */
function calleeFor(
  name: string,
  imports: MockImports,
  bindings: ModuleBindings,
  missing: ImportedName[],
): string {
  const resolution = resolveCallee(name, imports, bindings);
  if (resolution.kind === "imported") return resolution.callee;
  const local = resolution.kind === "free" ? name : firstFreeName(name, bindings);
  missing.push({ imported: name, local });
  return local;
}
