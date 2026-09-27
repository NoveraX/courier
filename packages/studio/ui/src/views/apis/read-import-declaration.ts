import type { ImportDeclaration } from "./types";

import { isPlainObject } from "@/socket/is-plain-object";

function readSource(raw: unknown): ImportDeclaration["source"] {
  if (!isPlainObject(raw)) return null;
  const { importLine, entry } = raw;
  if (typeof importLine !== "string" || typeof entry !== "string") return null;
  if (importLine === "" || entry === "") return null;
  return { importLine, entry };
}

function readNameTaken(raw: unknown): ImportDeclaration["nameTaken"] {
  if (!isPlainObject(raw)) return null;
  const { sourceFile } = raw;
  return typeof sourceFile === "string" && sourceFile !== "" ? { sourceFile } : null;
}

function readCount(raw: unknown): number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
}

/**
 * Read what Studio's answer to a write says courier.config must still
 * declare. Only a plain object is read, and every field is checked: a part
 * that is missing or malformed counts as declared already, and an answer
 * with no part left, and no name taken, is no declaration at all.
 *
 * @param raw - The decoded body of `POST /api/apis/write`
 * @returns What is left to declare, or `null` when nothing is
 *
 * @example
 * ```ts
 * readImportDeclaration({ written: 2, declaration: { configFile: "courier.config.ts", importEntry: '  "pets": {…},' } });
 * // → { configFile: "courier.config.ts", source: null, importEntry: '  "pets": {…},', leftOut: 0, nameTaken: null }
 * readImportDeclaration({ written: 2 }); // → null
 * ```
 */
export function readImportDeclaration(raw: unknown): ImportDeclaration | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.declaration)) return null;
  const { configFile, source, importEntry, leftOut, nameTaken } = raw.declaration;
  if (typeof configFile !== "string" || configFile === "") return null;
  const declaration: ImportDeclaration = {
    configFile,
    source: readSource(source),
    importEntry: typeof importEntry === "string" && importEntry !== "" ? importEntry : null,
    leftOut: readCount(leftOut),
    nameTaken: readNameTaken(nameTaken),
  };
  const { source: parts, importEntry: entry, nameTaken: taken } = declaration;
  return parts === null && entry === null && taken === null ? null : declaration;
}
