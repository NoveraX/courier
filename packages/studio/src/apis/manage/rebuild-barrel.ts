import { posix } from "node:path";
import { importsCarryExtensions, parseSource } from "@noverax/courier-cli/devkit";
import type { ExportAllDeclaration, ExportNamedDeclaration, Program } from "oxc-parser";
import { exportName } from "../../server/mocks-edit/plan/export-name";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { compareSpecifiers } from "../generator/import-order";
import { namedStatement } from "../generator/named-statement";
import type { ImportLayout } from "../layout";
import { type ExportedKind, exportedNames } from "./exported-names";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/* A schemas or types module of an import, as its barrel names it: `./pets/schemas`, `./types.js`. */
const SCHEMA_MODULE = /^\.\/(?:([^/]+)\/)?(schemas|types)(?:\.js)?$/;
/* A group's endpoints module, as source.ts imports it. */
const GROUP_INDEX = /^\.\/([^/]+)\/index(?:\.js)?$/;

type Reexport = ExportAllDeclaration | ExportNamedDeclaration;

/**
 * The import's barrel with its re-exports of the import's schema modules
 * written again from the files as they are now, as a full write writes
 * them: the import's own module and each listed group's, in the order
 * linters sort them, each re-exported by the names no earlier line
 * exports, so no name is exported twice and none a module exports is left
 * out. A line the user wrote — a type-only list, a
 * renamed name, a module that is not one of the import's — stays as it is,
 * and its names count as exported. A whole-module `export *` an older
 * version wrote is the generator's own and is written again by name.
 * Everything else in the barrel stays too.
 *
 * @param layout - Where the import's files are
 * @param files - The import's files as the change leaves them, by path, without Studio's header
 * @returns The barrel, or `undefined` when the import has none
 * @throws {UnrecognizedFileError} When the barrel does not parse
 * @example
 * ```ts
 * const barrel = rebuildBarrel(layout, { ...onDisk, ...changed });
 * ```
 */
export function rebuildBarrel(
  layout: ImportLayout,
  files: Readonly<Record<string, string>>,
): string | undefined {
  const barrel = files[layout.indexFile];
  if (barrel === undefined) return undefined;
  const parsed = parseSource(layout.indexFile, barrel);
  if (parsed.problem !== null) throw new UnrecognizedFileError(layout.indexFile);
  /* Written as the barrel writes its imports, with their extension or without. */
  const extension = importsCarryExtensions(parsed.program) ? ".js" : "";
  const modules = schemaModules(layout, files)
    .map((specifier) => `${specifier}${extension}`)
    .sort(compareSpecifiers);
  const textOf = (specifier: string): string | undefined =>
    files[posix.join(layout.dir, `${specifier.replace(/\.js$/, "")}.ts`)];
  const owned = new Set(modules);
  const generated = parsed.program.body.filter(
    (s): s is Reexport => isReexport(s) && isGenerated(s, owned, textOf),
  );
  const kept = parsed.program.body.filter((s) => !generated.includes(s as Reexport));
  const taken = barrelNames(kept, textOf);
  const lines = modules.flatMap((specifier) => lineFor(specifier, textOf(specifier), taken));
  return withLines(barrel, generated, lines);
}

/* The import's schema modules: its own, and each listed group's. */
function schemaModules(layout: ImportLayout, files: Readonly<Record<string, string>>): string[] {
  const existing = (dir: string | null): string[] =>
    (["schemas", "types"] as const)
      .map((kind) => (dir === null ? `./${kind}` : `./${dir}/${kind}`))
      .filter((specifier) => files[posix.join(layout.dir, `${specifier}.ts`)] !== undefined)
      .slice(0, 1);
  return [...existing(null), ...groupDirs(layout, files).flatMap((dir) => existing(dir))];
}

/* The folders of the groups source.ts imports, in its order; every group folder when it does not parse. */
function groupDirs(layout: ImportLayout, files: Readonly<Record<string, string>>): string[] {
  const source = files[layout.sourceFile];
  const parsed = source === undefined ? null : parseSource(layout.sourceFile, source);
  if (parsed === null || parsed.problem !== null) {
    const prefix = `${layout.dir}/`;
    return Object.keys(files)
      .filter(
        (path) => path.startsWith(prefix) && /^[^/]+\/index\.ts$/.test(path.slice(prefix.length)),
      )
      .map((path) => path.slice(prefix.length).split("/")[0] ?? "")
      .sort();
  }
  return parsed.program.body.flatMap((s) => {
    const match = s.type === "ImportDeclaration" ? GROUP_INDEX.exec(s.source.value) : null;
    return match?.[1] === undefined ? [] : [match[1]];
  });
}

function isReexport(statement: Program["body"][number]): statement is Reexport {
  return (
    (statement.type === "ExportAllDeclaration" && statement.exported === null) ||
    (statement.type === "ExportNamedDeclaration" && statement.source !== null)
  );
}

/* A line in the generator's own form for one of the import's modules, or for one that is gone. */
function isGenerated(
  statement: Reexport,
  owned: ReadonlySet<string>,
  textOf: (specifier: string) => string | undefined,
): boolean {
  const specifier = statement.source?.value ?? "";
  if (!SCHEMA_MODULE.test(specifier)) return false;
  if (!owned.has(specifier) && textOf(specifier) !== undefined) return false;
  if (statement.type === "ExportAllDeclaration") return true;
  /* A type-only list is the generator's for a module of types alone, the user's otherwise. */
  const text = textOf(specifier);
  if (statement.exportKind === "type" && text !== undefined && !onlyTypes(text)) return false;
  return statement.specifiers.every((s) => exportName(s.local) === exportName(s.exported));
}

function onlyTypes(text: string): boolean {
  const kinds = [...namesOf(text).values()];
  return kinds.length > 0 && kinds.every((kind) => kind === "type");
}

/* What the lines that stay export: their own lists, and every name of each module they re-export whole. */
function barrelNames(
  statements: Program["body"],
  textOf: (specifier: string) => string | undefined,
): Map<string, ExportedKind> {
  const names = exportedNames(statements);
  for (const s of statements) {
    if (s.type !== "ExportAllDeclaration" || s.exported !== null) continue;
    for (const [name, kind] of namesOf(textOf(s.source.value))) names.set(name, kind);
  }
  return names;
}

function namesOf(text: string | undefined): Map<string, ExportedKind> {
  if (text === undefined) return new Map();
  return exportedNames(parseSource("module.ts", text).program.body);
}

function lineFor(
  specifier: string,
  text: string | undefined,
  taken: Map<string, ExportedKind>,
): string[] {
  const fresh = [...namesOf(text)].filter(([name]) => !taken.has(name));
  for (const [name, kind] of fresh) taken.set(name, kind);
  if (fresh.length === 0) return [];
  if (fresh.every(([, kind]) => kind === "type")) {
    return [
      namedStatement(
        "export type",
        fresh.map(([name]) => name),
        specifier,
      ),
    ];
  }
  const listed = fresh.map(([name, kind]) => (kind === "type" ? `type ${name}` : name));
  return [namedStatement("export", listed, specifier)];
}

/* The barrel with the generated lines replaced, where the first of them was, or at its end. */
function withLines(
  barrel: string,
  generated: readonly Reexport[],
  lines: readonly string[],
): string {
  const spans = generated.map((s) => {
    const eol = barrel.indexOf("\n", s.end);
    return { start: lineStart(barrel, s.start), end: eol === -1 ? barrel.length : eol + 1 };
  });
  let text = barrel;
  for (const { start, end } of [...spans].reverse()) text = text.slice(0, start) + text.slice(end);
  const block = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  const at = spans[0]?.start;
  if (at !== undefined) return text.slice(0, at) + block + text.slice(at);
  if (block === "") return text;
  const base =
    text.endsWith("\n\n") || text === "" ? text : text.endsWith("\n") ? `${text}\n` : `${text}\n\n`;
  return `${base}${block}`;
}
