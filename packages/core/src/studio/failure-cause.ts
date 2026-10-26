import { HTTPError } from "../errors";
import { CourierError } from "../errors/courier-error";
import { causeOf } from "../http-client/transport-failure";
import { isRecord } from "../utils/is-record";
import { isNetworkFailure } from "./network-failure";

/* Deeper than any chain a program builds on purpose; a deeper one is cut, as the log cuts it. */
const DEEPEST = 16;

/** Why a request got no answer: its error code, when it gave one, and its text. */
export interface FailureCause {
  /** The system's code — `ENOTFOUND`, `ECONNREFUSED`, `DEPTH_ZERO_SELF_SIGNED_CERT` — or Courier's own `TIMEOUT`. */
  code?: string;
  /** What the platform said. */
  message: string;
}

/**
 * Why a request that got no answer failed, as the platform said it: an
 * `HTTPError` with status 0, whose body holds the platform's text and
 * code; or a connection the app's own code made on the way — a
 * middleware's `fetch` — that the system refused, with the code it gave,
 * however deep under the app's own errors it lies: the deepest network
 * failure in the chain says why, or the error directly under the failure
 * by whatever code it names. Courier's own errors say what they are
 * already, and one in the chain ends it. Studio reads the code's shape and
 * cuts what leaves the page that holds its token; the app's own code
 * carries none of that.
 *
 * @param error - What the request threw
 * @returns The cause, or `undefined` for a failure that got an answer or says nothing
 * @example
 * ```ts
 * failureCause(error); // → { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.example.invalid" }
 * failureCause(new TypeError("fetch failed", { cause: refused })); // → { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" }
 * failureCause(new Error("No user id", { cause: new TypeError("fetch failed", { cause: refused }) })); // the same
 * ```
 */
export function failureCause(error: unknown): FailureCause | undefined {
  if (error instanceof HTTPError) return error.status === 0 ? unanswered(error.data) : undefined;
  if (!(error instanceof Error) || error instanceof CourierError) return undefined;
  const coded = codedCause(error);
  if (coded instanceof HTTPError) return coded.status === 0 ? unanswered(coded.data) : undefined;
  return coded === undefined ? undefined : causeOf(coded);
}

function unanswered(data: unknown): FailureCause | undefined {
  if (!isRecord(data) || typeof data.message !== "string" || data.message.trim() === "") {
    return undefined;
  }
  return typeof data.code === "string" && data.code !== ""
    ? { code: data.code, message: data.message }
    : { message: data.message };
}

/* The deepest error under a failure that says why — the failure itself
   only when nothing lies under it — or a Courier error on the way, which
   says what it is. A chain that loops ends where it repeats.

   The first error is read as Studio has always read it: by whatever code
   the system or the app named it. Deeper down, an error names a code for
   reasons of its own — a file it could not open, by its path; a row a
   database refused, by its values — so only a network failure says why a
   request got no answer there, by the rule Courier's MCP server tells an
   agent a cause by. */
function codedCause(error: Error): Error | undefined {
  const seen = new Set<Error>();
  let found: Error | undefined;
  let link: unknown = error.cause instanceof Error ? error.cause : error;
  while (link instanceof Error && !seen.has(link) && seen.size < DEEPEST) {
    if (link instanceof CourierError) return link instanceof HTTPError ? link : found;
    const says = seen.size === 0 ? systemCode(link) : isNetworkFailure(link);
    seen.add(link);
    if (says) found = link;
    link = link.cause;
  }
  return found;
}

/* The system names what it refused with a code; an error without one is the app's own word. */
function systemCode(error: Error): boolean {
  return "code" in error && typeof error.code === "string" && error.code !== "";
}
