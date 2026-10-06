import { isDiffHunk } from "@/features/mocks/wizard/is-diff-hunk";
import type { DiffHunk } from "@/features/mocks/wizard/wire-types";
import { isPlainObject } from "@/socket/is-plain-object";

/** The change that takes an import out of courier.config, as Studio previewed it. */
export type ConfigUndeclare =
  /** The lines Studio would remove, ready to quote with the removal. */
  | { status: "ready"; configFile: string; hunks: DiffHunk[]; baseHash: string }
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
  const { configFile, hunks, baseHash } = raw;
  if (typeof configFile !== "string" || typeof baseHash !== "string") return null;
  if (!Array.isArray(hunks) || !hunks.every(isDiffHunk)) return null;
  return { status: "ready", configFile, hunks, baseHash };
}
