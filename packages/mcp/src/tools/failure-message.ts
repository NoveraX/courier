import { isHTTPError, isValidationError, type ValidationIssue } from "@noverax/courier";

import { isRecord } from "../is-record";

/** How much of an error answer a model is shown: enough to act on, not a page of HTML. */
const EXCERPT = 2_000;

/**
 * What a failed call tells the model, so it can correct its arguments, try
 * again later, or tell the person why it stopped.
 *
 * It names what failed and quotes the answer, cut short; it never quotes a
 * response's headers, which may carry a credential.
 *
 * @param error - What the call failed with
 * @returns The sentence the tool result carries
 * @example
 * ```ts
 * failureMessage(new HTTPError({ status: 404, headers, data: { message: "No order 7" } }));
 * // 'The call failed with status 404: {"message":"No order 7"}'
 * ```
 */
export function failureMessage(error: unknown): string {
  if (isValidationError(error)) {
    const what =
      error.target === "variables"
        ? "The arguments do not match what the tool takes"
        : "The API answered with what the endpoint's response schema does not allow";
    return `${what}:\n${error.issues.map(issueLine).join("\n")}`;
  }
  if (isHTTPError(error)) {
    if (error.status === 0)
      return `The API could not be reached: ${detailOf(error.data) ?? error.message}`;
    return `The call failed with status ${error.status}: ${excerpt(error.data)}`;
  }
  return `The call failed: ${error instanceof Error ? error.message : String(error)}`;
}

function issueLine(issue: ValidationIssue): string {
  const path = (issue.path ?? [])
    .map((key) => String(typeof key === "object" && key !== null ? key.key : key))
    .join(".");
  return `- ${path === "" ? "(arguments)" : path}: ${issue.message}`;
}

function detailOf(data: unknown): string | undefined {
  return isRecord(data) && typeof data.message === "string" ? data.message : undefined;
}

function excerpt(data: unknown): string {
  if (data === undefined || data === null || data === "") return "no content";
  const text = typeof data === "string" ? data : (JSON.stringify(data) ?? String(data));
  return text.length > EXCERPT
    ? `${text.slice(0, EXCERPT)}… (${text.length} characters in all)`
    : text;
}
