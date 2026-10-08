import type { SessionOptions } from "../session/types";
import type { JSONSchema } from "./types";

/** How the API's session reads as OpenAPI: its schemes, and what reads and writes require. */
export interface SecurityPlan {
  readonly schemes: Record<string, JSONSchema>;
  /** What a read requires: the session's credentials */
  readonly read: Array<Record<string, string[]>>;
  /** What a write requires: those, and the double-submit header where the session has one */
  readonly write: Array<Record<string, string[]>>;
}

const NOT_IN_A_NAME = /[^A-Za-z0-9._-]/g;

/**
 * The security schemes an API's `session` describes: each cookie it is
 * kept in, named exactly, as a cookie key; its `bearer` cookie as an HTTP
 * bearer token; its double-submit header as a header key, which writes
 * require beside the session. A cookie named by a prefix, `logto_*`, has
 * no one name to give, and is said in the description instead.
 *
 * @param session - The API's session, if it keeps one
 * @returns The plan, or `undefined` for an API that keeps no session
 * @example
 * ```ts
 * securityOf({ cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } });
 * ```
 */
export function securityOf(session: SessionOptions | undefined): SecurityPlan | undefined {
  if (session === undefined) return undefined;
  const schemes: Record<string, JSONSchema> = {};
  const cookies = session.cookies ?? [];
  const prefixes = cookies.filter((name) => name.endsWith("*"));
  for (const name of cookies.filter((cookie) => !cookie.endsWith("*"))) {
    schemes[`cookie_${name}`.replace(NOT_IN_A_NAME, "_")] = { type: "apiKey", in: "cookie", name };
  }
  if (prefixes.length > 0) {
    schemes.session_cookies = {
      type: "apiKey",
      in: "cookie",
      name: prefixes[0]?.slice(0, -1) ?? "",
      description: `The session is kept in the cookies whose names begin ${prefixes.map((p) => p.slice(0, -1)).join(", ")}`,
    };
  }
  if (session.bearer !== undefined) {
    schemes.bearer = {
      type: "http",
      scheme: "bearer",
      description: `The token the ${session.bearer} cookie holds`,
    };
  }
  const read = requirement(Object.keys(schemes));
  if (session.csrf === undefined) return { schemes, read: [read], write: [read] };
  schemes.csrf = {
    type: "apiKey",
    in: "header",
    name: session.csrf.header,
    description: `Repeats the ${session.csrf.cookie} cookie on every write`,
  };
  return { schemes, read: [read], write: [{ ...read, csrf: [] }] };
}

function requirement(names: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(names.map((name) => [name, []]));
}
