import { CourierError } from "@noverax/courier";
import type { CourierImportAuth, CourierSecretValue } from "@noverax/courier/config";
import { isSecretVariableName } from "@noverax/courier/internal";
import { isRecord } from "@noverax/courier-cli/devkit";

/** Why an import's auth cannot be sent; none of them carries a secret's value. */
export type ImportAuthErrorCode =
  | "AUTH_INVALID"
  | "SECRET_NAME_INVALID"
  | "SECRET_NOT_SET"
  | "SECRET_NOT_REFERENCED"
  | "HEADER_NAME_INVALID"
  | "HEADER_NOT_ALLOWED"
  | "HEADER_VALUE_INVALID";

/** An import's auth that cannot be sent: what is wrong with it, by name and never by value. */
export class ImportAuthError extends CourierError<ImportAuthErrorCode> {
  readonly httpStatus = 400;

  constructor(code: ImportAuthErrorCode, message: string) {
    super(message, { code });
  }
}

/** How long and how many: the most an import's auth may name. */
export const IMPORT_AUTH_LIMITS = {
  /** Characters in an environment variable's name, as the core's rule for one bounds it. */
  envName: 256,
  /** Headers a `header` auth sends. */
  headers: 32,
  /** Characters in one value, read from the environment or not. */
  value: 8 * 1024,
} as const;

/* RFC 9110's token: what a field name is made of. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
/* The request's own framing and its hop: a value of the auth's would break it, or reach past the host. */
const NOT_ALLOWED: ReadonlySet<string> = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "proxy-connection",
  "proxy-authorization",
  "accept-encoding",
]);

function invalid(message: string): ImportAuthError {
  return new ImportAuthError("AUTH_INVALID", message);
}

function secretOf(raw: unknown, field: string, referencesOnly: boolean): CourierSecretValue {
  if (typeof raw === "string") {
    if (referencesOnly) {
      throw new ImportAuthError(
        "SECRET_NOT_REFERENCED",
        `${field} must name the environment variable that holds it, as { env: "NAME" }: Studio takes no secret's value from a request.`,
      );
    }
    return raw;
  }
  if (!isRecord(raw) || Object.keys(raw).length !== 1 || typeof raw.env !== "string") {
    throw invalid(`${field} must be ${referencesOnly ? "" : "a string or "}{ env: "NAME" }`);
  }
  /* Refused without the name: a value given in its place would be said back. */
  if (!isSecretVariableName(raw.env)) {
    throw new ImportAuthError(
      "SECRET_NAME_INVALID",
      `${field} names no environment variable: a name is written in capitals, digits and _, not starting with a digit, up to ${IMPORT_AUTH_LIMITS.envName} characters, as ORDERS_SPEC_TOKEN.`,
    );
  }
  return { env: raw.env };
}

function headersOf(raw: unknown, referencesOnly: boolean): Record<string, CourierSecretValue> {
  if (!isRecord(raw)) throw invalid("auth.headers must be an object of header names");
  const names = Object.keys(raw);
  if (names.length === 0 || names.length > IMPORT_AUTH_LIMITS.headers) {
    throw invalid(`auth.headers must name 1 to ${IMPORT_AUTH_LIMITS.headers} headers`);
  }
  const headers: Record<string, CourierSecretValue> = {};
  for (const name of names) {
    if (!HEADER_NAME.test(name)) {
      throw new ImportAuthError(
        "HEADER_NAME_INVALID",
        "auth.headers names something no header is called: a header's name is one word with no space, colon or quote, as X-Api-Key.",
      );
    }
    if (NOT_ALLOWED.has(name.toLowerCase())) {
      throw new ImportAuthError(
        "HEADER_NOT_ALLOWED",
        `auth.headers.${name} frames the request itself, so an import's auth cannot set it.`,
      );
    }
    Object.defineProperty(headers, name, {
      value: secretOf(raw[name], `auth.headers.${name}`, referencesOnly),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return headers;
}

/**
 * Read an import's auth, as a config, a request or the command line gives
 * it, into what it is: bearer, basic or header, each secret a string or a
 * reference to the environment variable that holds it, and the header names
 * fit to send. A request's and the command line's must name variables:
 * Studio takes no secret's value from them, so none crosses a page or a
 * shell's history.
 *
 * @param raw - The auth as given
 * @param referencesOnly - Whether every secret must be a reference to the environment
 * @returns The auth
 * @throws {ImportAuthError} For an auth of no such shape, a name no variable has, a header no request may carry, or a value given where a reference must be
 * @example
 * ```ts
 * readImportAuth({ type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } }, true);
 * ```
 */
export function readImportAuth(raw: unknown, referencesOnly: boolean): CourierImportAuth {
  if (!isRecord(raw)) throw invalid("auth must be an object with its type");
  if (raw.type === "bearer")
    return { type: "bearer", token: secretOf(raw.token, "auth.token", referencesOnly) };
  if (raw.type === "basic") {
    return {
      type: "basic",
      username: secretOf(raw.username, "auth.username", referencesOnly),
      password: secretOf(raw.password, "auth.password", referencesOnly),
    };
  }
  if (raw.type === "header")
    return { type: "header", headers: headersOf(raw.headers, referencesOnly) };
  throw invalid("auth.type must be bearer, basic or header");
}
