import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/* A group's schemas or types module, as a barrel names it. */
const GROUP_MODULE = /^\.\/[^/]+\/(?:schemas|types)$/;

/**
 * Add to an import's barrel the re-exports a freshly generated barrel has
 * and the one on disk lacks: those of groups added since, a module being
 * matched by what it names, not by how the line is spelled. Nothing
 * already there is changed or dropped.
 *
 * @param path - The barrel, project-relative
 * @param existing - The barrel on disk, without Studio's header
 * @param generated - The barrel generated for the groups being added
 * @returns The barrel with the missing re-exports appended, or `existing` when none is missing
 * @throws {UnrecognizedFileError} When the barrel on disk does not parse
 * @example
 * ```ts
 * appendBarrelExports("src/api/pets/index.ts", onDisk, generatedIndex.content);
 * ```
 */
export function appendBarrelExports(path: string, existing: string, generated: string): string {
  const onDisk = parseSource(path, existing);
  if (onDisk.problem !== null) throw new UnrecognizedFileError(path);
  const present = new Set(
    onDisk.program.body.flatMap((s) =>
      (s.type === "ExportAllDeclaration" || s.type === "ExportNamedDeclaration") &&
      s.source !== null
        ? [s.source.value]
        : [],
    ),
  );
  const fresh = parseSource("generated.ts", generated);
  const missing = fresh.program.body.flatMap((s) => {
    const isReexport = s.type === "ExportAllDeclaration" || s.type === "ExportNamedDeclaration";
    if (
      !isReexport ||
      s.source === null ||
      !GROUP_MODULE.test(s.source.value) ||
      present.has(s.source.value)
    )
      return [];
    return [generated.slice(s.start, s.end)];
  });
  if (missing.length === 0) return existing;
  const base = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${base}${missing.join("\n")}\n`;
}
