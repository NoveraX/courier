import { REDACTED } from "./redacted";
import { splitUrlsWithoutSecrets } from "./split-urls-without-secrets";
import { urlWithoutSecrets } from "./url-without-secrets";

/*
 * Every quantifier is bounded, no two neighbours share a character, and a
 * match starts only after a character its run cannot hold: no input makes
 * these read a part of the text twice.
 */
const URL_IN_TEXT = /(^|[^a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>()]{1,8192})/gi;
/*
 * A colon after a user, or in a password: any but a drive's — one a lone
 * letter leads and a backslash follows, as a Windows path starts — so
 * `D:\app\node_modules\@scope\pkg` names a file, not user `D` before host
 * `scope`. Only a colon a backslash follows is looked behind, two
 * characters back.
 */
const COLON = ":(?!\\\\(?<=(?<![A-Za-z0-9])[A-Za-z]:\\\\))";
/* `user:password@host` written without a scheme, after a space, a quote or a bracket. */
const BARE_USERINFO = new RegExp(
  `(^|[\\s"'(<,;=])[^\\s@:/"'<>]{1,64}${COLON}(?:[^\\s@/:"'<>]|${COLON}){1,128}@(?=[A-Za-z0-9.[-])`,
  "g",
);

/**
 * A text with every address in it cut as {@link urlWithoutSecrets} cuts
 * one, and a `user:password@` written before a host without a scheme cut
 * too — a Windows path is none, though one that names a scoped package
 * holds a colon and an `@`. An address no single word holds — one fetch
 * quotes as it refuses it, a password a quote or a space splits — loses
 * its credentials whole first, as {@link splitUrlsWithoutSecrets} cuts
 * them.
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
  return splitUrlsWithoutSecrets(text)
    .replace(
      URL_IN_TEXT,
      (_match, before: string, address: string) => before + urlWithoutSecrets(address),
    )
    .replace(BARE_USERINFO, `$1${REDACTED}@`);
}
