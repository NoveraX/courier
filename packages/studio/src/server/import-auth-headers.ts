import type { CourierImportAuth, CourierSecretValue } from "@noverax/courier/config";
import { sendableValue } from "@noverax/courier/internal";

import { IMPORT_AUTH_LIMITS, ImportAuthError } from "./import-auth";

/**
 * The value an environment holds under a name: its own, never one its
 * prototype answers for `__proto__`, and none when it is empty.
 *
 * @param env - The environment
 * @param name - The variable's name
 * @returns The value, or `undefined` when the variable is not set
 * @example
 * ```ts
 * variableValue(process.env, "ORDERS_SPEC_TOKEN");
 * ```
 */
export function variableValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  if (!Object.hasOwn(env, name)) return undefined;
  const value = env[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/* A secret's value: as given, or read from the environment now. */
function secretValue(
  secret: CourierSecretValue,
  field: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const value = typeof secret === "string" ? secret : variableValue(env, secret.env);
  if (value === undefined || value === "") {
    throw new ImportAuthError(
      "SECRET_NOT_SET",
      `${field} reads ${typeof secret === "string" ? "an empty value" : `${secret.env}, which is not set`}: set it in the environment or in one of the project's .env files.`,
    );
  }
  if (value.length > IMPORT_AUTH_LIMITS.value) {
    throw new ImportAuthError(
      "HEADER_VALUE_INVALID",
      `${field} is longer than ${IMPORT_AUTH_LIMITS.value} characters; the value is not shown.`,
    );
  }
  return value;
}

/**
 * The headers an import's auth sends its specification's host, its
 * references read from the environment now — the process's, which takes
 * the project's `.env*` files in — and every value checked as `fetch`
 * checks one, the error naming the field and never the value.
 *
 * @param auth - The import's auth, if it declares one
 * @param env - Where its references are read from
 * @returns The headers; none without an auth
 * @throws {ImportAuthError} `SECRET_NOT_SET` for a variable that is not set, `HEADER_VALUE_INVALID` for a value no request can carry
 * @example
 * ```ts
 * importAuthHeaders({ type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } }); // → { authorization: "Bearer …" }
 * ```
 */
export function importAuthHeaders(
  auth: CourierImportAuth | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  if (auth === undefined) return {};
  /* Checked as fetch checks a value, and refused as the auth's own error, by its field. */
  const sendable = (name: string, value: string, field: string): string => {
    try {
      return sendableValue(name, value, `${field}'s value`);
    } catch (err) {
      throw new ImportAuthError("HEADER_VALUE_INVALID", err instanceof Error ? err.message : field);
    }
  };
  if (auth.type === "bearer") {
    const token = secretValue(auth.token, "auth.token", env);
    return { authorization: sendable("authorization", `Bearer ${token}`, "auth.token") };
  }
  if (auth.type === "basic") {
    const credentials = `${secretValue(auth.username, "auth.username", env)}:${secretValue(auth.password, "auth.password", env)}`;
    return {
      authorization: sendable(
        "authorization",
        `Basic ${Buffer.from(credentials).toString("base64")}`,
        "auth.password",
      ),
    };
  }
  const headers: Record<string, string> = {};
  for (const [name, secret] of Object.entries(auth.headers)) {
    const field = `auth.headers.${name}`;
    Object.defineProperty(headers, name, {
      value: sendable(name, secretValue(secret, field, env), field),
      enumerable: true,
    });
  }
  return headers;
}
