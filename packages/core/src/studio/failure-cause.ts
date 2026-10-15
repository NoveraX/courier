import { HTTPError } from "../errors";
import { isRecord } from "../utils/is-record";

/** Why a request got no answer, as the system said it: its error code, when it gave one, and its text. */
export interface FailureCause {
  /** The system's code: `ENOTFOUND`, `ECONNREFUSED`, `DEPTH_ZERO_SELF_SIGNED_CERT`. */
  code?: string;
  /** What the system said, with every URL in it cut to its origin and path. */
  message: string;
}

/* A system error code is a short upper-case name; anything else is not passed on. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_MESSAGE_LENGTH = 300;
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()]+/gi;
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i;

/**
 * Why a request that got no answer failed, as Studio may show it.
 *
 * Only a failure with no answer has one — an `HTTPError` with status 0,
 * whose body holds the system's text and code. Its text can name the URL
 * the request went to, so a credential in that URL — a query parameter,
 * a `user:password@` — is cut before the cause leaves the runtime.
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
 * A cause made safe to show: its code kept only when it reads as a system
 * error code, its text cleared of control characters, every URL in it cut
 * to its origin and path, and the whole cut to 300 characters.
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
  const message = shownText(value.message);
  if (message === "") return undefined;
  const code = typeof value.code === "string" && CODE_PATTERN.test(value.code) ? value.code : "";
  return code ? { code, message } : { message };
}

function shownText(text: string): string {
  const plain = printable(text).replace(URL_IN_TEXT, withoutSecrets).trim();
  return plain.length > MAX_MESSAGE_LENGTH ? `${plain.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : plain;
}

/* A line break or another control character would break the line Studio shows the text on. */
function printable(text: string): string {
  let shown = "";
  for (const character of text) {
    const code = character.charCodeAt(0);
    shown += code < 0x20 || code === 0x7f ? " " : character;
  }
  return shown;
}

/* What the URL addresses, never what it carries: no user, password, query or fragment. */
function withoutSecrets(address: string): string {
  try {
    const url = new URL(address);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    /* Not a URL the parser reads: cut by hand what could carry a secret. */
    return address.replace(USERINFO, "$1").replace(/[?#].*$/, "");
  }
}
