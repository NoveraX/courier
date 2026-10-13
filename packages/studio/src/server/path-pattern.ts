import { directoryPattern, separatorPattern } from "./directory-pattern";
import type { PathStyle } from "./path-style";

/* Where a path starts: not inside a word, a longer path or a URL — after its
   host, its port, or an IPv6 address in brackets — so `/srv/Users/ana`,
   `https://host/Users/ana` and `https://[::1]/Users/ana` are left whole. A
   `file:` URL — and on Windows the `\\?\` that lifts the length limit — goes
   with the path it holds. */
const NOT_INSIDE = String.raw`(?<![\p{L}\p{M}\p{N}_.~%+\-\\/])(?<!\/\/[^\s/\]]*\])`;
const FILE_URL = String.raw`file:(?:\/\/(?:localhost)?)?`;
const LONG_PATH = String.raw`(?:\\{1,2}){2}\?\\{1,2}`;

/* What follows the directory: the rest of a path inside it, up to a delimiter. */
const REST = String.raw`[^\s'"\x60()[\]{}<>|]*`;

/* What carries a folder's name on past the directory's, after dots or not:
   a letter, a digit or a mark, `_`, `-`, `~` or `+`, or a `file:` URL's
   escape of one. `/Users/anastasia` and `/Users/ana.bak` are other folders;
   `/Users/ana.`, `/Users/ana=`, `/Users/ana%2F` and the `/Users/ana\"` of
   JSON-escaped text name the directory itself. */
const NAME_GOES_ON = String.raw`\.*(?:[\p{L}\p{M}\p{N}_~+\-]|%(?!2[Ff]|5[Cc])[\dA-Fa-f]{2})`;

/* On Windows a backslash between the directory and a quote is no separator:
   it escapes the quote, as JSON writes it. */
const WINDOWS_SEPARATOR_AFTER = String.raw`(?:\\\\|\\(?!")|\/)`;

/**
 * The pattern of a path that lies in one of the directories, or names one
 * of them itself, as a platform's texts write it: in a `file:` URL, on
 * Windows behind the `\\?\` that lifts the length limit, and not inside a
 * word, a longer path or a URL. Each directory is a group of its own, in
 * the order given; the separator after it and the rest of the path are the
 * two groups that follow, and match nothing for a directory named alone.
 * Every part of it reads each character a bounded number of times, so a
 * text of megabytes is matched in about as long as it takes to read.
 *
 * @param dirs - The directories, absolute, the one to try first first
 * @param style - How the platform spells paths
 * @returns A regular expression's source, for a pattern with the `u` flag
 * @example
 * ```ts
 * const pattern = new RegExp(pathPattern(["/Users/ana"], style), "gu");
 * "open '/Users/ana/x.ts'".replace(pattern, (_, dir, separator, rest) => `~/${rest}`); // → "open '~/x.ts'"
 * ```
 */
export function pathPattern(dirs: readonly string[], style: PathStyle): string {
  const prefix = style.windows ? `(?:${FILE_URL}\\/|${LONG_PATH})?` : `(?:${FILE_URL})?`;
  const groups = dirs.map((dir) => `(${directoryPattern(dir, style)})`);
  const separator = style.windows ? WINDOWS_SEPARATOR_AFTER : separatorPattern(style);
  const after = `(?:(${separator})(${REST})|(?!${NAME_GOES_ON}))`;
  return `${NOT_INSIDE}${prefix}(?:${groups.join("|")})${after}`;
}
