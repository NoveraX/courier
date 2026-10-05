import { isPlainObject } from "@/socket/is-plain-object";
import { isDiffHunk } from "./is-diff-hunk";
import { isStringList } from "./is-string-list";
import type { DeclarePreview, FieldError, ManualReason } from "./wire-types";
import { REFUSAL_CODES } from "./wire-types";

const CODES: ReadonlySet<unknown> = new Set(REFUSAL_CODES);
const FIELDS: ReadonlySet<unknown> = new Set([
  "key",
  "source",
  "port",
  "seedCount",
  "endpoints",
  "fixtures",
]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function isReason(raw: unknown): raw is ManualReason {
  return (
    isPlainObject(raw) &&
    CODES.has(raw.code) &&
    (raw.source === null || typeof raw.source === "string") &&
    typeof raw.message === "string"
  );
}

function isFieldError(raw: unknown): raw is FieldError {
  return (
    isPlainObject(raw) &&
    typeof raw.index === "number" &&
    Number.isSafeInteger(raw.index) &&
    raw.index >= 0 &&
    typeof raw.source === "string" &&
    FIELDS.has(raw.field) &&
    typeof raw.message === "string"
  );
}

/* A created file has nothing to start from, so its base hash is null; an
   edit always shows at least one changed line. */
function isReady(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.target === "string" &&
    typeof raw.creates === "boolean" &&
    (raw.creates ? raw.baseHash === null : isSha256(raw.baseHash)) &&
    isSha256(raw.planDigest) &&
    Array.isArray(raw.hunks) &&
    raw.hunks.length > 0 &&
    raw.hunks.every(isDiffHunk) &&
    isStringList(raw.warnings)
  );
}

function isManual(raw: Record<string, unknown>): boolean {
  return (
    (raw.target === null || typeof raw.target === "string") &&
    typeof raw.creates === "boolean" &&
    Array.isArray(raw.reasons) &&
    raw.reasons.length > 0 &&
    raw.reasons.every(isReason) &&
    typeof raw.snippet === "string" &&
    raw.snippet.length > 0 &&
    typeof raw.retryable === "boolean"
  );
}

function isInvalid(raw: Record<string, unknown>): boolean {
  return Array.isArray(raw.errors) && raw.errors.length > 0 && raw.errors.every(isFieldError);
}

/**
 * Whether Studio's answer to a preview is one the wizard understands: a
 * plan to confirm, the reason to add the mocks by hand, or the fields to
 * correct. Only plain objects are read, every field is checked, and an
 * unknown status or refusal code is refused, so the wizard can rely on the
 * declared type.
 *
 * @param raw - The decoded body of `POST /api/mocks/declare/preview`
 * @returns Whether it is a well-formed `DeclarePreview`
 *
 * @example
 * ```ts
 * const answer: unknown = await post("/api/mocks/declare/preview", { mocks });
 * if (!isDeclarePreview(answer)) throw new Error("Studio's answer could not be read");
 * ```
 */
export function isDeclarePreview(raw: unknown): raw is DeclarePreview {
  if (!isPlainObject(raw)) return false;
  switch (raw.status) {
    case "ready":
      return isReady(raw);
    case "manual":
      return isManual(raw);
    case "invalid":
      return isInvalid(raw);
    default:
      return false;
  }
}
