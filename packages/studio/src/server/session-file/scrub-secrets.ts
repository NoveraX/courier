import { cutSecrets, isSecretHeader, isSecretValue, REDACTED } from "@noverax/courier/internal";

import { isPlainObject } from "../is-plain-object";
import type { SavedRequest, SavedSession } from "../session-types";

/* Deep enough for any body a request carries; what lies deeper is cut, not walked. */
const DEEPEST = 64;

/**
 * A request as it leaves Studio — in a session file, an export, a recorded
 * test: every value of its variables and its answer, and of its address's
 * query, that Courier's one rule for a name and its value hides replaced,
 * and every string a name keeps — there and in its headers — read as the
 * core's `redact()` reads a text, a credential in an address or a pair
 * within it cut; each changed value's place added to `found`:
 * `requests[2].variables.password`, `requests[2].url?token`,
 * `requests[2].data.resetLink`.
 *
 * @param request - The request, credential headers already left out
 * @param at - Its place in the session
 * @param found - Where the replaced values are listed
 * @returns The request with its secrets replaced
 * @example
 * ```ts
 * const found: string[] = [];
 * session.requests.map((request, at) => scrubbedRequest(request, at, found));
 * ```
 */
export function scrubbedRequest(request: SavedRequest, at: number, found: string[]): SavedRequest {
  const place = `requests[${at}]`;
  return {
    ...request,
    variables: scrubbed(request.variables, `${place}.variables`, found, 0),
    data: scrubbed(request.data, `${place}.data`, found, 0),
    ...(request.url !== undefined && { url: scrubbedUrl(request.url, `${place}.url`, found) }),
    ...(request.requestHeaders !== undefined && {
      requestHeaders: scrubbedHeaders(request.requestHeaders, `${place}.requestHeaders`, found),
    }),
    ...(request.responseHeaders !== undefined && {
      responseHeaders: scrubbedHeaders(request.responseHeaders, `${place}.responseHeaders`, found),
    }),
  };
}

/**
 * A session as it is exported, as HAR, for Postman or as JSON: each request
 * as {@link scrubbedRequest} leaves it, the places not listed.
 *
 * @param session - The session, credential headers already left out
 * @returns The session with its secrets replaced
 * @example
 * ```ts
 * exportAsHar(scrubbedSession(session));
 * ```
 */
export function scrubbedSession(session: SavedSession): SavedSession {
  return {
    ...session,
    requests: session.requests.map((request, at) => scrubbedRequest(request, at, [])),
  };
}

/**
 * A body as a page without the project's token is sent it: every value
 * Courier's rule for a name hides replaced, as {@link scrubbedRequest}
 * replaces them, the places not listed.
 *
 * @param value - A request's variables or its answer
 * @returns The body with its secrets replaced
 * @example
 * ```ts
 * bodyWithoutSecrets({ email: "a@b.c", otp: 1234 }); // { email: "a@b.c", otp: "[redacted]" }
 * ```
 */
export function bodyWithoutSecrets(value: unknown): unknown {
  return scrubbed(value, "", [], 0);
}

/**
 * Headers as a page without the project's token is sent them: each value a
 * header's name hides replaced, and each other read as a text, as
 * {@link scrubbedRequest} reads them.
 *
 * @param headers - The headers, by name
 * @returns The same names, their secrets replaced
 * @example
 * ```ts
 * headersWithoutSecrets({ link: "<https://a.test/x?token=t>; rel=next" }); // token=[redacted]
 * ```
 */
export function headersWithoutSecrets(headers: Record<string, string>): Record<string, string> {
  return scrubbedHeaders(headers, "", []);
}

/* A credential header Studio already left out is listed nowhere: a session file never held it. */
function scrubbedHeaders(
  headers: Record<string, string>,
  path: string,
  found: string[],
): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const shown = isSecretHeader(name, value)
      ? REDACTED
      : typeof value === "string"
        ? cutSecrets(value)
        : value;
    if (shown !== value) found.push(`${path}.${name}`);
    copy[name] = shown;
  }
  return copy;
}

function scrubbed(value: unknown, path: string, found: string[], depth: number): unknown {
  if (depth > DEEPEST) return "[cut]";
  if (typeof value === "string") {
    const cut = cutSecrets(value);
    if (cut !== value) found.push(path);
    return cut;
  }
  if (Array.isArray(value)) {
    return value.map((item, at) => scrubbed(item, `${path}[${at}]`, found, depth + 1));
  }
  if (!isPlainObject(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isSecretValue(key, inner)) {
      found.push(`${path}.${key}`);
      copy[key] = REDACTED;
    } else copy[key] = scrubbed(inner, `${path}.${key}`, found, depth + 1);
  }
  return copy;
}

/* A read sends its variables in the query, so a `?token=` there is a secret like a body's. */
function scrubbedUrl(url: string, path: string, found: string[]): string {
  const query = url.indexOf("?");
  if (query === -1) return url;
  const hash = url.indexOf("#", query);
  const end = hash === -1 ? url.length : hash;
  const pairs = url.slice(query + 1, end).split("&");
  const kept = pairs.map((pair) => {
    const equals = pair.indexOf("=");
    const name = equals === -1 ? pair : pair.slice(0, equals);
    if (equals === -1 || !isSecretValue(decoded(name), decoded(pair.slice(equals + 1)))) {
      return pair;
    }
    found.push(`${path}?${decoded(name)}`);
    return `${name}=${REDACTED}`;
  });
  return `${url.slice(0, query + 1)}${kept.join("&")}${url.slice(end)}`;
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    /* A name or a value that is not valid percent-encoding is read as it is written. */
    return text;
  }
}
