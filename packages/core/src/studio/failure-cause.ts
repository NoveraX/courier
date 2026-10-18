import { HTTPError } from "../errors";
import { CourierError } from "../errors/courier-error";
import { platformCause } from "../http-client/transport-failure";
import { isRecord } from "../utils/is-record";

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
 * middleware's `fetch` — that the system refused, with the code it gave.
 * Courier's own errors say what they are already. Studio reads the code's
 * shape and cuts what leaves the page that holds its token; the app's own
 * code carries none of that.
 *
 * @param error - What the request threw
 * @returns The cause, or `undefined` for a failure that got an answer or says nothing
 * @example
 * ```ts
 * failureCause(error); // → { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.example.invalid" }
 * failureCause(new TypeError("fetch failed", { cause: refused })); // → { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" }
 * ```
 */
export function failureCause(error: unknown): FailureCause | undefined {
  if (error instanceof HTTPError) return error.status === 0 ? unanswered(error.data) : undefined;
  if (!(error instanceof Error) || error instanceof CourierError) return undefined;
  return systemCode(error) ? platformCause(error) : undefined;
}

function unanswered(data: unknown): FailureCause | undefined {
  if (!isRecord(data) || typeof data.message !== "string" || data.message.trim() === "") {
    return undefined;
  }
  return typeof data.code === "string" && data.code !== ""
    ? { code: data.code, message: data.message }
    : { message: data.message };
}

/* The system names what it refused with a code; an error without one is the app's own word. */
function systemCode(error: Error): boolean {
  const cause = error.cause instanceof Error ? error.cause : error;
  return "code" in cause && typeof cause.code === "string" && cause.code !== "";
}
