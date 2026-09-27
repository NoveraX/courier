import { posix } from "node:path";
import type { Program } from "oxc-parser";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { type ExportedKind, exportedNames } from "./exported-names";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/* A group's schemas or types module, as a barrel names it. */
const GROUP_MODULE = /^\.\/[^/]+\/(?:schemas|types)$/;

type Names = Map<string, ExportedKind>;

/** The barrel on disk, as the lines appended to it see it. */
interface Barrel {
  /** The modules it re-exports from. */
  present: ReadonlySet<string>;
  /** The names it exports, those appended so far included. */
  taken: Names;
  exportsOf: (specifier: string) => Names;
  generated: string;
}

/**
 * Add to an import's barrel the re-exports a freshly generated barrel has
 * and the one on disk lacks: those of groups added since, a module being
 * matched by what it names, not by how the line is spelled. A module that
 * exports a name the barrel already exports is re-exported by its other
 * names only, as a full write does, so no name is exported twice. Nothing
 * already there is changed or dropped.
 *
 * @param path - The barrel, project-relative
 * @param existing - The barrel on disk, without Studio's header
 * @param generated - The barrel generated for the groups being added
 * @param textAt - The text a file will have, by its project-relative path, if it exists
 * @returns The barrel with the missing re-exports appended, or `existing` when none is missing
 * @throws {UnrecognizedFileError} When the barrel on disk does not parse
 * @example
 * ```ts
 * appendBarrelExports("src/api/pets/index.ts", onDisk, generatedIndex.content, (path) => files[path]);
 * ```
 */
export function appendBarrelExports(
  path: string,
  existing: string,
  generated: string,
  textAt: (path: string) => string | undefined,
): string {
  const onDisk = parseSource(path, existing);
  if (onDisk.problem !== null) throw new UnrecognizedFileError(path);
  const exportsOf = (specifier: string): Names => {
    const text = textAt(posix.join(posix.dirname(path), `${specifier}.ts`));
    return text === undefined
      ? new Map()
      : exportedNames(parseSource(`${specifier}.ts`, text).program.body);
  };
  const barrel: Barrel = {
    present: reexportedModules(onDisk.program),
    taken: exportedNames(onDisk.program.body),
    exportsOf,
    generated,
  };
  for (const specifier of starModules(onDisk.program))
    for (const name of exportsOf(specifier).keys()) barrel.taken.set(name, "value");
  const missing = parseSource("generated.ts", generated).program.body.flatMap((statement) => {
    const line = reexportFor(statement, barrel);
    return line === null ? [] : [line];
  });
  if (missing.length === 0) return existing;
  const base = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${base}${missing.join("\n")}\n`;
}

/* The line re-exporting what a generated statement names and the barrel lacks, or `null`. */
function reexportFor(statement: Program["body"][number], barrel: Barrel): string | null {
  if (statement.type !== "ExportAllDeclaration" && statement.type !== "ExportNamedDeclaration")
    return null;
  const specifier = statement.source?.value;
  if (specifier === undefined || !GROUP_MODULE.test(specifier) || barrel.present.has(specifier))
    return null;
  const whole = statement.type === "ExportAllDeclaration";
  const names = whole ? barrel.exportsOf(specifier) : exportedNames([statement]);
  const fresh = [...names].filter(([name]) => !barrel.taken.has(name));
  for (const [name] of fresh) barrel.taken.set(name, "value");
  if (whole && fresh.length === names.size)
    return barrel.generated.slice(statement.start, statement.end);
  if (fresh.length === 0) return null;
  const listed = fresh.map(([name, kind]) => (kind === "type" ? `type ${name}` : name));
  return `export { ${listed.join(", ")} } from "${specifier}";`;
}

function reexportedModules(program: Program): Set<string> {
  return new Set(
    program.body.flatMap((s) =>
      (s.type === "ExportAllDeclaration" || s.type === "ExportNamedDeclaration") &&
      s.source !== null
        ? [s.source.value]
        : [],
    ),
  );
}

/* Only `export * from` re-exports names the barrel does not list. */
function starModules(program: Program): string[] {
  return program.body.flatMap((s) =>
    s.type === "ExportAllDeclaration" && s.exported === null ? [s.source.value] : [],
  );
}
