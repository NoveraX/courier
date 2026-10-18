import { isCredentialHeader } from "@noverax/courier/internal";

import { isPlainObject } from "../is-plain-object";
import { REDACTED } from "../secrets/redacted";

/* Deep enough for any body a model should read; what lies deeper is cut, not walked. */
const DEEPEST = 12;

/**
 * A copy of a body with the value of every field named like a credential —
 * a password, a token, a secret, an API key, a session — replaced, at any
 * depth: what Studio hands an agent leaves the machine with the model's
 * provider, so a secret a request carried in its body stays behind.
 *
 * @param value - A request's variables, an answer, or anything holding them
 * @returns The copy
 * @example
 * ```ts
 * withoutSecrets({ email: "a@b.c", password: "hunter2" }); // { email: "a@b.c", password: "[redacted]" }
 * ```
 */
export function withoutSecrets(value: unknown, depth = 0): unknown {
  if (depth > DEEPEST) return "[cut]";
  if (Array.isArray(value)) return value.map((item) => withoutSecrets(item, depth + 1));
  if (!isPlainObject(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    copy[key] = isSecretName(key) ? REDACTED : withoutSecrets(inner, depth + 1);
  }
  return copy;
}

/**
 * Whether a body field's name says it holds a secret — `password`,
 * `accessToken`, `client_secret`, `sessionId` — read as a header name is,
 * a camelCase name as its dashed form.
 *
 * @param key - The field's name
 * @returns Whether its value is kept out of sight
 * @example
 * ```ts
 * isSecretName("accessToken"); // true
 * ```
 */
export function isSecretName(key: string): boolean {
  return isCredentialHeader(key.replace(/([a-z0-9])([A-Z])/g, "$1-$2"));
}
