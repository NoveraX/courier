import { isPlainObject } from "@/socket/is-plain-object";
import { type FileHunks, readFileHunks } from "./read-file-hunks";
import { readImportDeclaration } from "./read-import-declaration";
import type { ImportDeclaration } from "./types";

/** Where declaring an imported API in courier.config stands, as Studio answered. */
export type ConfigDeclare =
  /**
   * The change Studio would make, ready to apply: each file it writes — the
   * module the config takes its `sources` from, when it does, then the config.
   */
  | { status: "ready"; configFile: string; files: FileHunks[]; baseHash: string; stale: boolean }
  /** Left to the developer: why, and the lines to add when Studio could work them out. */
  | { status: "manual"; code: string; reason: string; declaration: ImportDeclaration | null }
  /** The config declares the API already. */
  | { status: "declared" }
  /** Studio declared it and runs it: the files it changed, in order. */
  | { status: "applied"; files: string[] };

/**
 * Read Studio's answer to a preview or an apply of declaring an import in
 * courier.config. An apply that found the config saved since the preview
 * reads as the preview it carries, marked `stale`.
 *
 * @param raw - The decoded answer
 * @returns The answer, or `null` when it is not one
 * @example
 * ```ts
 * readConfigDeclare({ status: "applied", files: ["courier.config.ts"] })?.status; // → "applied"
 * ```
 */
export function readConfigDeclare(raw: unknown): ConfigDeclare | null {
  if (!isPlainObject(raw)) return null;
  switch (raw.status) {
    case "ready":
      return readReady(raw, false);
    case "stale":
      return isPlainObject(raw.preview) && raw.preview.status === "ready"
        ? readReady(raw.preview, true)
        : readConfigDeclare(raw.preview);
    case "manual":
      return typeof raw.code === "string" && typeof raw.reason === "string"
        ? {
            status: "manual",
            code: raw.code,
            reason: raw.reason,
            declaration: readImportDeclaration(raw),
          }
        : null;
    case "declared":
      return { status: "declared" };
    case "applied":
      return readApplied(raw.files);
    default:
      return null;
  }
}

function readReady(raw: Record<string, unknown>, stale: boolean): ConfigDeclare | null {
  const { configFile, baseHash } = raw;
  if (typeof configFile !== "string" || typeof baseHash !== "string") return null;
  const files = readFileHunks(raw.files);
  return files === null ? null : { status: "ready", configFile, files, baseHash, stale };
}

function readApplied(raw: unknown): ConfigDeclare | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const files = raw.filter((file): file is string => typeof file === "string" && file !== "");
  return files.length === raw.length ? { status: "applied", files } : null;
}
