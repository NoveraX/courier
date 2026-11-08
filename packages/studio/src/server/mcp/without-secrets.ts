import { isSecretValue, REDACTED } from "@noverax/courier/internal";

import { isPlainObject } from "../is-plain-object";

/* Deep enough for any body a model should read; what lies deeper is cut, not walked. */
const DEEPEST = 12;

/**
 * A copy of a body with the value of every field a credential's name gives
 * away replaced, at any depth, by Courier's one rule for a name and its
 * value — a password, a token, a session's id, a one-time password, and a
 * `key` that reads as a credential: what Studio hands an agent leaves the
 * machine with the model's provider, so a secret a request carried in its
 * body stays behind, as the core's own log and a session file leave it.
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
    copy[key] = isSecretValue(key, inner) ? REDACTED : withoutSecrets(inner, depth + 1);
  }
  return copy;
}
