import { REDACTED } from "./redacted";
import { urlWithoutSecrets } from "./url-without-secrets";

/*
 * Every quantifier is bounded, no two neighbours share a character, and a
 * match starts only after a character its run cannot hold: no input makes
 * these read a part of the text twice.
 */
const URL_IN_TEXT = /(^|[^a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>()]{1,8192})/gi;
/* `user:password@host` written without a scheme, after a space, a quote or a bracket. */
const BARE_USERINFO = /(^|[\s"'(<,;=])[^\s@:/"'<>]{1,64}:[^\s@/"'<>]{1,128}@(?=[A-Za-z0-9.[-])/g;

/**
 * A text with every address in it cut as {@link urlWithoutSecrets} cuts
 * one, and a `user:password@` written before a host without a scheme cut
 * too.
 *
 * @param text - The text, already cut to a bounded length
 * @returns The text with its addresses cut
 * @example
 * ```ts
 * urlsWithoutSecrets("GET https://ana:pw@api.test/v1?sig=abc123 failed");
 * // → "GET https://api.test/v1?sig=[redacted] failed"
 * ```
 */
export function urlsWithoutSecrets(text: string): string {
  return text
    .replace(
      URL_IN_TEXT,
      (_match, before: string, address: string) => before + urlWithoutSecrets(address),
    )
    .replace(BARE_USERINFO, `$1${REDACTED}@`);
}
