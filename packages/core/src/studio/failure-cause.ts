import { HTTPError } from "../errors";
import { isRecord } from "../utils/is-record";
import { shownText } from "./shown-text";

/** Why a request got no answer: its error code, when it gave one, and its text. */
export interface FailureCause {
  /** The system's code — `ENOTFOUND`, `ECONNREFUSED`, `DEPTH_ZERO_SELF_SIGNED_CERT` — or Courier's own `TIMEOUT`. */
  code?: string;
  /** What the platform said, with what could be a credential cut out. */
  message: string;
}

/* A system error code is a short upper-case name; anything else is not passed on. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_MESSAGE_LENGTH = 300;

/* What fetch says, with no code, when it fails without an answer — in a browser, in Node, in Deno, in Bun. */
const PLATFORM_TEXTS: readonly RegExp[] = [
  /^Failed to fetch$/,
  /^Load failed$/,
  /^NetworkError when attempting to fetch resource\.?$/,
  /^The network connection was lost\.?$/,
  /^Network request failed$/,
  /^fetch failed$/,
  /^bad port$/,
  /^Request was cancelled\.?$/,
  /^Request cannot be constructed from a URL that includes credentials: \S+$/,
  /^error sending request /,
  /^Unable to connect\. Is the computer able to access the url\?$/,
];

/** What a cause says when its text did not come from the platform. */
export const UNSHOWN_CAUSE =
  "Not shown: this text did not come from the platform, and may hold a secret. The error the call rejected with has it.";

/**
 * Why a request that got no answer failed, as Studio may show it.
 *
 * Only a failure with no answer has one — an `HTTPError` with status 0,
 * whose body holds the platform's text and code.
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
  return shownCause(error.data);
}

/**
 * A cause made safe to show.
 *
 * A text that comes with a system error code is the platform's own, in a
 * form that names a host, an address or a certificate's fault, and is
 * passed on with anything that could be a credential cut out. A text with
 * no code may come from anywhere — the app's own `fetch` or transport, a
 * wrapper that put its request in the message — so only what fetch itself
 * says is passed on, and any other text is replaced with
 * {@link UNSHOWN_CAUSE}. Either is cut to 300 characters.
 *
 * @param value - A cause as it arrived, of any shape
 * @returns The cause, or `undefined` when it has no text
 * @example
 * ```ts
 * shownCause({ code: "ECONNREFUSED", message: "connect https://u:p@api.test/x?token=t" });
 * // → { code: "ECONNREFUSED", message: "connect https://api.test/x" }
 * ```
 */
export function shownCause(value: unknown): FailureCause | undefined {
  if (!isRecord(value) || typeof value.message !== "string") return undefined;
  const text = shownText(value.message, MAX_MESSAGE_LENGTH);
  if (text === "") return undefined;
  const code = typeof value.code === "string" && CODE_PATTERN.test(value.code) ? value.code : "";
  if (code) return { code, message: text };
  return { message: PLATFORM_TEXTS.some((said) => said.test(text)) ? text : UNSHOWN_CAUSE };
}
