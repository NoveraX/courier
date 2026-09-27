/* A barrel line re-exporting from one module. */
const REEXPORT = /^export (?:\*|\{[^}]*\}) from "([^"]+)";?$/;

/**
 * Drop from an import's barrel the re-exports of modules that are going:
 * those of the groups removed whole. Every other line stays as it is.
 *
 * @param existing - The barrel on disk, without Studio's header
 * @param specifiers - The modules going, as the barrel imports them (`./users/schemas`)
 * @returns The barrel without their re-exports, or `existing` when it has none
 * @example
 * ```ts
 * removeBarrelExports(onDisk, new Set(["./users/schemas", "./users/types"]));
 * ```
 */
export function removeBarrelExports(existing: string, specifiers: ReadonlySet<string>): string {
  const lines = existing.split("\n");
  const kept = lines.filter((line) => {
    const from = line.trim().match(REEXPORT)?.[1];
    return from === undefined || !specifiers.has(from);
  });
  return kept.length === lines.length ? existing : kept.join("\n");
}
