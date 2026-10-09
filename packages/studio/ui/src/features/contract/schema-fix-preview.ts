import { isDiffHunk } from "@/features/mocks/wizard/is-diff-hunk";
import type { DiffHunk } from "@/features/mocks/wizard/wire-types";
import { isPlainObject } from "@/socket/is-plain-object";

/** The endpoint whose response schema a fix changes. */
export interface SchemaFixTarget {
  source: string;
  /** Its call in the client: `products.get` */
  endpoint: string;
}

/** A difference a fix leaves as it is, and why. */
export interface LeftDifference {
  path: string;
  why: string;
}

/** The change Studio would write to a schema, or why it writes none. */
export type SchemaFixPreview =
  | {
      status: "ready";
      /** Each file the change touches, from the project's root, with its diff */
      files: Array<{ file: string; hunks: DiffHunk[] }>;
      /** The differences it fixes */
      fixed: string[];
      left: LeftDifference[];
      /** Names this change: an apply that finds another applies nothing */
      digest: string;
    }
  | { status: "manual"; reason: string; left: LeftDifference[] };

/**
 * Read the change Studio planned for a schema: a ready one only with every
 * file's diff whole, else why there is none.
 *
 * @param value - What Studio answered
 * @returns The preview, or `undefined` when the answer is neither
 * @example
 * ```ts
 * const preview = schemaFixPreviewOf(await post("/api/contract/fix/preview", target));
 * ```
 */
export function schemaFixPreviewOf(value: unknown): SchemaFixPreview | undefined {
  if (!isPlainObject(value)) return undefined;
  const left = leftOf(value.left);
  if (value.status === "manual" && typeof value.reason === "string") {
    return { status: "manual", reason: value.reason, left };
  }
  if (value.status !== "ready" || typeof value.digest !== "string" || !Array.isArray(value.files)) {
    return undefined;
  }
  const files = value.files.flatMap(
    (file): Array<{ file: string; hunks: DiffHunk[] }> =>
      isPlainObject(file) &&
      typeof file.file === "string" &&
      Array.isArray(file.hunks) &&
      file.hunks.every(isDiffHunk)
        ? [{ file: file.file, hunks: file.hunks }]
        : [],
  );
  if (files.length !== value.files.length) return undefined;
  const fixed = Array.isArray(value.fixed)
    ? value.fixed.filter((path) => typeof path === "string")
    : [];
  return { status: "ready", files, fixed, left, digest: value.digest };
}

function leftOf(value: unknown): LeftDifference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): LeftDifference[] =>
    isPlainObject(entry) && typeof entry.path === "string" && typeof entry.why === "string"
      ? [{ path: entry.path, why: entry.why }]
      : [],
  );
}
