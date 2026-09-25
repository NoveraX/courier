import type { DeclareApplyResult } from "./wire-types";

import { isPlainObject } from "@/socket/is-plain-object";
import { isDeclarePreview } from "./is-declare-preview";
import { isInsertedLine } from "./is-inserted-line";
import { isStringList } from "./is-string-list";

function isApplied(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.target === "string" &&
    isStringList(raw.keys) &&
    raw.keys.length > 0 &&
    isStringList(raw.warnings)
  );
}

function isRolledBack(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.target === "string" &&
    typeof raw.creates === "boolean" &&
    typeof raw.reason === "string" &&
    typeof raw.snippet === "string" &&
    raw.snippet.length > 0
  );
}

/* Studio names the lines it added so the user can take them out by hand;
   an edit always adds at least one. */
function isLeftInPlace(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.target === "string" &&
    typeof raw.reason === "string" &&
    Array.isArray(raw.insertedLines) &&
    raw.insertedLines.length > 0 &&
    raw.insertedLines.every(isInsertedLine)
  );
}

/**
 * Whether Studio's answer to an apply is one the wizard understands: the
 * mocks added, a new plan because the file changed since the preview, the
 * fields to correct, the reason to add them by hand, or an edit Studio wrote
 * that did not check out — taken back, or left in place with the lines it
 * added. Only plain objects are read and every field is checked; a stale
 * answer's plan is checked as a preview.
 *
 * @param raw - The decoded body of `POST /api/mocks/declare/apply`
 * @returns Whether it is a well-formed `DeclareApplyResult`
 *
 * @example
 * ```ts
 * isDeclareApplyResult({ status: "applied", target: "courier.mocks.ts", keys: ["apiMock"], warnings: [] });
 * // → true
 * isDeclareApplyResult({ status: "stale", plan: { status: "applied" } }); // → false
 * ```
 */
export function isDeclareApplyResult(raw: unknown): raw is DeclareApplyResult {
  if (!isPlainObject(raw)) return false;
  switch (raw.status) {
    case "applied":
      return isApplied(raw);
    case "stale":
      return isDeclarePreview(raw.plan);
    case "invalid":
    case "manual":
      return isDeclarePreview(raw);
    case "rolledBack":
      return isRolledBack(raw);
    case "notVerified":
    case "rollbackFailed":
      return isLeftInPlace(raw);
    default:
      return false;
  }
}
