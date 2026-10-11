import type { ImportDeclaration } from "@/features/apis/types";
import { isPlainObject } from "@/socket/is-plain-object";

function readSource(raw: unknown): ImportDeclaration["source"] {
  if (!isPlainObject(raw)) return null;
  const { importLine, entry } = raw;
  if (typeof importLine !== "string" || typeof entry !== "string") return null;
  if (importLine === "" || entry === "") return null;
  return { importLine, entry };
}

function readCount(raw: unknown): number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
}

/**
 * Read what Studio's answer to a write says courier.config must still
 * declare. Only a plain object is read, and every field is checked: a part
 * that is missing or malformed counts as declared already, and an answer
 * with no part left is no declaration at all.
 *
 * @param raw - The decoded body of `POST /api/apis/write`
 * @returns What is left to declare, or `null` when nothing is
 *
 * @example
 * ```ts
 * readImportDeclaration({ written: ["src/api/pets/source.ts"], declaration: { configFile: "courier.config.ts", importEntry: '  "pets": {…},' } });
 * // → { configFile: "courier.config.ts", sourcesFile: null, source: null, importEntry: '  "pets": {…},', leftOut: 0 }
 * readImportDeclaration({ written: ["src/api/pets/source.ts"] }); // → null
 * ```
 */
export function readImportDeclaration(raw: unknown): ImportDeclaration | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.declaration)) return null;
  const { configFile, sourcesFile, source, importEntry, leftOut } = raw.declaration;
  if (typeof configFile !== "string" || configFile === "") return null;
  const declaration: ImportDeclaration = {
    configFile,
    sourcesFile: typeof sourcesFile === "string" && sourcesFile !== "" ? sourcesFile : null,
    source: readSource(source),
    importEntry: typeof importEntry === "string" && importEntry !== "" ? importEntry : null,
    leftOut: readCount(leftOut),
  };
  return declaration.source === null && declaration.importEntry === null ? null : declaration;
}
