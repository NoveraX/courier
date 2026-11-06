import type { CourierImportAuth } from "@noverax/courier/config";

import { readImportAuth } from "../../server/import-auth";

/** The options of `import` that name where a private specification's credentials are. */
export interface AuthFlags {
  "bearer-env"?: string | undefined;
  "basic-env"?: string | undefined;
  "header-env"?: string | undefined;
}

/* `NAME=VALUE`, the name before the first `=`. What was given is not said back: it may be a value. */
function pair(given: string, flag: string): [string, string] {
  const at = given.indexOf("=");
  if (at < 1 || at === given.length - 1) {
    throw new Error(`--${flag} takes Header=VARIABLE pairs, separated by commas`);
  }
  return [given.slice(0, at).trim(), given.slice(at + 1).trim()];
}

/**
 * The auth a private specification is read with, as the command line names
 * it: the environment variable that holds each credential, never the
 * credential itself, so none is left in a shell's history.
 *
 * - `--bearer-env ORDERS_SPEC_TOKEN` — an `Authorization: Bearer` token;
 * - `--basic-env SPEC_USER:SPEC_PASSWORD` — a user and a password;
 * - `--header-env "X-Api-Key=ORDERS_API_KEY,X-Tenant=TENANT_ID"` — headers.
 *
 * @param flags - The options as typed
 * @returns The auth, or `undefined` when none is named
 * @throws {Error} When more than one is named, or one names no variable
 * @example
 * ```ts
 * authFromFlags({ "bearer-env": "ORDERS_SPEC_TOKEN" }); // → { type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } }
 * ```
 */
export function authFromFlags(flags: AuthFlags): CourierImportAuth | undefined {
  const named = (["bearer-env", "basic-env", "header-env"] as const).filter(
    (flag) => flags[flag] !== undefined,
  );
  if (named.length > 1) {
    throw new Error(`--${named.join(", --")} each name an auth; give one of them`);
  }
  const bearer = flags["bearer-env"];
  if (bearer !== undefined) return readImportAuth({ type: "bearer", token: { env: bearer } }, true);
  const basic = flags["basic-env"];
  if (basic !== undefined) {
    const [username, password] = basic.split(":");
    if (username === undefined || password === undefined || basic.split(":").length !== 2) {
      throw new Error(
        "--basic-env takes USER_VARIABLE:PASSWORD_VARIABLE, the two variables' names",
      );
    }
    return readImportAuth(
      { type: "basic", username: { env: username }, password: { env: password } },
      true,
    );
  }
  const header = flags["header-env"];
  if (header === undefined) return undefined;
  const headers = Object.fromEntries(
    header
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, variable] = pair(part, "header-env");
        return [name, { env: variable }];
      }),
  );
  return readImportAuth({ type: "header", headers }, true);
}
