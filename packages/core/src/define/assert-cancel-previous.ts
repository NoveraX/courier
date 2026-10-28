import { ConfigurationError } from "../errors/configuration-error";

/**
 * Refuse a `cancelPrevious` that is neither `true` nor `false`, where an
 * API, a group or a client is made, a proxy client is given its routes, or
 * a call is sent. Read as on or off, any other value would cancel calls
 * nobody asked to cancel, or none.
 *
 * @param value - The option as it was given
 * @param where - Whose option it is, for the message: `API "accounts"`, `A group`
 * @param remedy - What to do about it, when not marking the reads themselves
 * @throws ConfigurationError `CANCEL_PREVIOUS_INVALID`
 * @example
 * ```ts
 * assertCancelPrevious(options.cancelPrevious, 'API "accounts"');
 * ```
 */
export function assertCancelPrevious(
  value: unknown,
  where: string,
  remedy = "Mark each read it is for with .cancelPrevious().",
): void {
  if (value === undefined || typeof value === "boolean") return;
  const kind = typeof value;
  const given = Array.isArray(value)
    ? "a list"
    : value === null
      ? "null"
      : `${kind === "object" ? "an" : "a"} ${kind}`;
  throw new ConfigurationError(
    "CANCEL_PREVIOUS_INVALID",
    `[courier] ${where}: cancelPrevious is true or false, not ${given}. ${remedy}`,
  );
}
