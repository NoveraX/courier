import type { ValidationIssue } from "./types"
import { isRecord } from "./event-helpers"

/**
 * Read the issues a runtime reports for a failed validation.
 *
 * They arrive as Standard Schema issues: a message, and a path of keys or
 * `{ key }` segments. The UI shows the path as one dotted string; an issue
 * without a message is left out.
 *
 * @param raw - The `issues` of a `validation:fail` event
 * @returns The issues the UI can show, or `undefined` when `raw` is not a list
 *
 * @example
 * ```ts
 * validationIssuesOf([{ message: "Required", path: ["user", { key: "age" }] }])
 * // [{ path: "user.age", message: "Required" }]
 * ```
 */
export function validationIssuesOf(raw: unknown): ValidationIssue[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const issues: ValidationIssue[] = []
  for (const item of raw) {
    if (!isRecord(item) || typeof item.message !== "string") continue
    issues.push({ path: pathOf(item.path), message: item.message })
  }
  return issues
}

function pathOf(raw: unknown): string {
  if (typeof raw === "string") return raw
  if (!Array.isArray(raw)) return ""
  return raw.map((segment) => String(isRecord(segment) ? segment.key : segment)).join(".")
}
