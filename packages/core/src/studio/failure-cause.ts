import { HTTPError } from "../errors";
import { isRecord } from "../utils/is-record";

/** Why a request got no answer: its error code, when it gave one, and its text. */
export interface FailureCause {
  /** The system's code — `ENOTFOUND`, `ECONNREFUSED`, `DEPTH_ZERO_SELF_SIGNED_CERT` — or Courier's own `TIMEOUT`. */
  code?: string;
  /** What the platform said. */
  message: string;
}

/**
 * Why a request that got no answer failed, as the platform said it — an
 * `HTTPError` with status 0, whose body holds the platform's text and
 * code. Studio reads the code's shape and cuts what leaves the page that
 * holds its token; the app's own code carries none of that.
 *
 * @param error - What the request threw
 * @returns The cause, or `undefined` for a failure that got an answer or says nothing
 * @example
 * ```ts
 * failureCause(error); // → { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.example.invalid" }
 * ```
 */
export function failureCause(error: unknown): FailureCause | undefined {
  if (!(error instanceof HTTPError) || error.status !== 0) return undefined;
  const data: unknown = error.data;
  if (!isRecord(data) || typeof data.message !== "string" || data.message.trim() === "") {
    return undefined;
  }
  return typeof data.code === "string" && data.code !== ""
    ? { code: data.code, message: data.message }
    : { message: data.message };
}
