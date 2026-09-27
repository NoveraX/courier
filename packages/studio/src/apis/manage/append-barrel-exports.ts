/* A barrel line re-exporting a group's schemas or types. */
const GROUP_EXPORT = /^export (?:\*|\{[^}]*\}) from "\.\/[^"]+\/(?:schemas|types)";$/;

/**
 * Add to an import's barrel the re-exports a freshly generated barrel has
 * and the one on disk lacks: those of groups added since. Nothing already
 * there is changed or dropped.
 *
 * @param existing - The barrel on disk, without Studio's header
 * @param generated - The barrel generated for the groups being added
 * @returns The barrel with the missing re-exports appended, or `existing` when none is missing
 * @example
 * ```ts
 * appendBarrelExports(onDisk, generatedIndex.content);
 * ```
 */
export function appendBarrelExports(existing: string, generated: string): string {
  const present = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = generated
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => GROUP_EXPORT.test(line) && !present.has(line));
  if (missing.length === 0) return existing;
  const base = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${base}${missing.join("\n")}\n`;
}
