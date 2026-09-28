import { ValidationError, type ValidationIssue } from "../validation";

type Target = ValidationError["target"];
type PathSegment = NonNullable<ValidationIssue["path"]>[number];

const TARGETS: readonly Target[] = ["variables", "response", "receive"];

/**
 * The validation failure a proxy answered with, as a direct call throws it.
 *
 * The handler answers a call whose variables or answer fail their schema
 * with 422 and `{ target, issues }`. A proxy client threw it on as a plain
 * HTTPError, so `isValidationError` told a failed validation apart in
 * direct mode and not through the proxy, and the issues sat in `error.data`.
 *
 * @param status - The answer's status
 * @param data - Its body, unwrapped from a `.raw` envelope
 * @returns The ValidationError, or `undefined` for any other failure
 * @example
 * ```ts
 * validationFailure(422, { success: false, target: "variables", issues: [{ message: "Required" }] });
 * // → ValidationError, target "variables"
 * ```
 */
export function validationFailure(status: number, data: unknown): ValidationError | undefined {
  if (status !== 422 || typeof data !== "object" || data === null) return undefined;
  if (!("target" in data) || !("issues" in data)) return undefined;
  const { target, issues } = data;
  if (!isTarget(target) || !Array.isArray(issues)) return undefined;
  const read: ValidationIssue[] = [];
  for (const value of issues) {
    const issue = issueOf(value);
    if (!issue) return undefined;
    read.push(issue);
  }
  return new ValidationError(target, read);
}

function isTarget(value: unknown): value is Target {
  return TARGETS.some((target) => target === value);
}

/* An issue as its schema library wrote it, its own fields — a code, a
   minimum — kept, as a direct call keeps them. */
function issueOf(value: unknown): ValidationIssue | undefined {
  if (typeof value !== "object" || value === null || !("message" in value)) return undefined;
  const { message } = value;
  if (typeof message !== "string") return undefined;
  if (!("path" in value) || value.path === undefined) return { ...value, message };
  const path = pathOf(value.path);
  return path ? { ...value, message, path } : undefined;
}

/* A path as JSON carries it: names and indexes, or `{ key }` segments. */
function pathOf(value: unknown): PathSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const path: PathSegment[] = [];
  for (const segment of value) {
    if (typeof segment === "string" || typeof segment === "number") path.push(segment);
    else if (typeof segment === "object" && segment !== null && "key" in segment) {
      const { key } = segment;
      if (typeof key !== "string" && typeof key !== "number") return undefined;
      path.push({ key });
    } else return undefined;
  }
  return path;
}
