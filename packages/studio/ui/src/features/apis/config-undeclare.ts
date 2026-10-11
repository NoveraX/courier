import { isPlainObject } from "@/socket/is-plain-object";
import { type FileHunks, readFileHunks } from "./read-file-hunks";

/** The change that takes an import out of courier.config, as Studio previewed it. */
export type ConfigUndeclare =
  /**
   * The lines Studio would remove, ready to quote with the removal: from each
   * file it writes — the module the config takes its `sources` from, when the
   * source is listed there, then the config.
   */
  | { status: "ready"; configFile: string; files: FileHunks[]; baseHash: string }
  /** Left to the developer, and why. */
  | { status: "manual"; code: string; reason: string };

/**
 * Read the change to courier.config a removal preview carries.
 *
 * @param raw - The preview's `config`
 * @returns The change, or `null` when the config does not declare the import or the answer is not one
 * @example
 * ```ts
 * readConfigUndeclare({ status: "manual", code: "NOT_LOADED", reason: "…" })?.status; // → "manual"
 * ```
 */
export function readConfigUndeclare(raw: unknown): ConfigUndeclare | null {
  if (!isPlainObject(raw)) return null;
  if (raw.status === "manual") {
    const { code, reason } = raw;
    return typeof code === "string" && typeof reason === "string"
      ? { status: "manual", code, reason }
      : null;
  }
  if (raw.status !== "ready") return null;
  const { configFile, baseHash } = raw;
  if (typeof configFile !== "string" || typeof baseHash !== "string") return null;
  const files = readFileHunks(raw.files);
  return files === null ? null : { status: "ready", configFile, files, baseHash };
}
