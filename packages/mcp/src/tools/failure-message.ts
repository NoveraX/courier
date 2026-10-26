import {
  type HTTPError,
  isHTTPError,
  isValidationError,
  type ValidationIssue,
} from "@noverax/courier";

import { isRecord } from "../is-record";
import { causeLines, FETCH_FAILED } from "./cause-lines";
import { errorCode } from "./error-code";
import { reasonLine } from "./reason-line";
import { recordedReason } from "./recorded-reason";
import { shownReason } from "./shown-reason";

/** How much of an error answer a model is shown: enough to act on, not a page of HTML. */
const EXCERPT = 2_000;
/* The code a call's failure carries when its time ran out. */
const TIMEOUT = "TIMEOUT";

/**
 * What a failed call tells the model, so it can correct its arguments, try
 * again later, or tell the person why it stopped.
 *
 * It names what failed and quotes the answer, cut short; it never quotes a
 * response's headers, which may carry a credential. A call that got no
 * answer says why, as the system said it: the code, and the host and port
 * it could not reach. A failure of the application's own code says what it
 * threw and, a line each, the network failures that caused it — no other
 * cause, whose text nothing vouches for. In those two no address shows more
 * than its scheme, host and port, and no header value the platform refused
 * is quoted.
 *
 * @param error - What the call failed with
 * @returns The sentence the tool result carries
 * @example
 * ```ts
 * failureMessage(new HTTPError({ status: 404, headers, data: { message: "No order 7" } }));
 * // 'The call failed with status 404: {"message":"No order 7"}'
 * failureMessage(new TypeError("fetch failed", { cause: connectTimeout }));
 * // "The call failed: fetch failed\nCaused by: UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)"
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
    if (error.status === 0) return noAnswer(error);
    return `The call failed with status ${error.status}: ${excerpt(error.data)}`;
  }
  const failure =
    error instanceof Error
      ? reasonLine(error, EXCERPT)
      : shownReason(String(error), { limit: EXCERPT });
  return withCauses(`The call failed: ${failure}`, causeLines(error));
}

/* A call whose time ran out is told apart from a host that could not be
   reached: the API may be up, and slow. */
function noAnswer(error: HTTPError): string {
  const recorded = recordedReason(error, EXCERPT);
  if (isRecord(error.data) && error.data.code === TIMEOUT) {
    return `The API did not answer in time: ${recorded}`;
  }
  const [first, ...beneath] = causeLines(error);
  const reason =
    first !== undefined && first !== FETCH_FAILED ? first : unexplained(error, recorded);
  return withCauses(`The API could not be reached: ${reason}`, beneath);
}

/* With no network failure beneath fetch's own `fetch failed` to say why,
   the client's record does: undici's words where it named no code, for
   what it would not do — `bad port`, `redirect count exceeded` — and the
   code alone where it named one whose text is not told, as a socket's
   path is not. */
function unexplained(error: HTTPError, recorded: string): string {
  return errorCode(error.data) ?? recorded;
}

function withCauses(sentence: string, causes: readonly string[]): string {
  return [sentence, ...causes.map((cause) => `Caused by: ${cause}`)].join("\n");
}

function issueLine(issue: ValidationIssue): string {
  const path = (issue.path ?? [])
    .map((key) => String(typeof key === "object" && key !== null ? key.key : key))
    .join(".");
  return `- ${path === "" ? "(arguments)" : path}: ${issue.message}`;
}

function excerpt(data: unknown): string {
  if (data === undefined || data === null || data === "") return "no content";
  const text = typeof data === "string" ? data : (JSON.stringify(data) ?? String(data));
  return text.length > EXCERPT
    ? `${text.slice(0, EXCERPT)}… (${text.length} characters in all)`
    : text;
}
