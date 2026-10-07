import { assertAllowedOrigins } from "../adapter/assert-allowed-origins";
import { ConfigurationError } from "../errors/configuration-error";
import { isRecord } from "../utils/is-record";
import { cookieNameProblem } from "./cookie-names";
import { csrfSourceProblem } from "./csrf-source";
import { headerNameProblem } from "./header-names";
import { assertSecureTransport } from "./transport";

const CSRF_KEYS: ReadonlySet<string> = new Set(["cookie", "header", "from"]);
const SESSION_KEYS: ReadonlySet<string> = new Set([
  "cookies",
  "bearer",
  "csrf",
  "relay",
  "allowedOrigins",
  "allowHttp",
]);

/**
 * Refuse, where the API is defined, a session that could not work as
 * written: a key no session has, a cookie name no browser keeps, a header
 * no request can carry, a session that names no credential at all, or one
 * whose API is reached over plain HTTP across the public internet.
 *
 * @param session - The `session` the API was defined with
 * @param baseURL - Where the API is reached
 * @param where - The API, named in the error
 * @throws ConfigurationError `SESSION_OPTIONS_INVALID`, `INVALID_ALLOWED_ORIGIN`
 *   or `SESSION_INSECURE_TRANSPORT`
 * @example
 * ```ts
 * assertSessionOptions({ cookies: ["sid"] }, "https://api.example.com", "api");
 * ```
 */
export function assertSessionOptions(
  session: unknown,
  baseURL: string | undefined,
  where: string,
): void {
  if (session === undefined) return;
  const problem = sessionProblem(session);
  if (problem !== undefined) {
    throw new ConfigurationError("SESSION_OPTIONS_INVALID", `${where}: session ${problem}`);
  }
  const options = session as Record<string, unknown>;
  assertAllowedOrigins(options.allowedOrigins as readonly string[] | undefined, `${where}.session`);
  if (options.allowHttp !== true) assertSecureTransport({ url: baseURL, name: where });
}

function sessionProblem(session: unknown): string | undefined {
  if (!isRecord(session))
    return "is an object: { cookies, bearer, csrf, relay, allowedOrigins, allowHttp }";
  const unknown = Object.keys(session).find((key) => !SESSION_KEYS.has(key));
  if (unknown !== undefined) return `has no option "${unknown}"`;
  const { cookies, bearer, csrf } = session;
  if (cookies === undefined && bearer === undefined) {
    return "names no credential: list the cookies it is kept in, or a bearer cookie";
  }
  return (
    cookiesProblem(cookies) ??
    (bearer === undefined ? undefined : named("bearer", cookieNameProblem(bearer, false))) ??
    csrfProblem(csrf) ??
    flagProblem(session, "relay") ??
    flagProblem(session, "allowHttp") ??
    listProblem(session.allowedOrigins, "allowedOrigins")
  );
}

function cookiesProblem(cookies: unknown): string | undefined {
  if (cookies === undefined) return undefined;
  const listed = listProblem(cookies, "cookies");
  if (listed !== undefined) return listed;
  for (const name of cookies as unknown[]) {
    const problem = cookieNameProblem(name, true);
    if (problem !== undefined) return named("cookies", problem);
  }
  return undefined;
}

function csrfProblem(csrf: unknown): string | undefined {
  if (csrf === undefined) return undefined;
  if (!isRecord(csrf))
    return 'csrf is { cookie, header, from? }, such as { cookie: "csrftoken", header: "x-csrftoken" }';
  const extra = Object.keys(csrf).find((key) => !CSRF_KEYS.has(key));
  if (extra !== undefined) return `csrf has no option "${extra}"`;
  return (
    named("csrf.cookie", cookieNameProblem(csrf.cookie, false)) ??
    named("csrf.header", headerNameProblem(csrf.header)) ??
    named("csrf.from", csrfSourceProblem(csrf.from))
  );
}

function flagProblem(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return value === undefined || typeof value === "boolean" ? undefined : `${key} is true or false`;
}

function listProblem(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? undefined
    : `${key} is a list of strings`;
}

function named(key: string, problem: string | undefined): string | undefined {
  return problem === undefined ? undefined : `${key}: ${problem}`;
}
