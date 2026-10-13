import { foldersOf } from "./folders-of";
import type { PathStyle } from "./path-style";

/* Windows separates folders with `\` — doubled where a text holds JSON — or `/`. */
const WINDOWS_SEPARATOR = String.raw`(?:\\{1,2}|\/)`;
const POSIX_SEPARATOR = String.raw`\/`;

/* What a `file:` URL writes as `%XX`: a space, the URL's own punctuation, and every character past ASCII. */
const URL_PUNCTUATION = new Set(['"', "#", "%", "<", ">", "?", "`", "{", "}", "\\"]);
const UTF8 = new TextEncoder();

/**
 * The pattern of what separates two folders, as a platform's texts write it.
 *
 * @param style - How the platform spells paths
 * @returns A regular expression's source, for a pattern with the `u` flag
 * @example
 * ```ts
 * new RegExp(`a${separatorPattern(style)}b`, "u").test("a\\\\b"); // → true on Windows: JSON writes `\` twice
 * ```
 */
export function separatorPattern(style: PathStyle): string {
  return style.windows ? WINDOWS_SEPARATOR : POSIX_SEPARATOR;
}

/**
 * The pattern of a directory as a text may name it: each folder as written,
 * in either Unicode normal form, and as a `file:` URL writes it; on Windows
 * with either slash between folders, or a backslash doubled as JSON writes
 * it. Letter case is the regular expression's flag to set.
 *
 * @param dir - The directory, absolute
 * @param style - How the platform spells paths
 * @returns A regular expression's source, for a pattern with the `u` flag
 * @example
 * ```ts
 * directoryPattern("/Users/Ana Maria", { windows: false, caseless: true });
 * // → "\\/Users\\/(?:Ana Maria|Ana%20Maria)"
 * ```
 */
export function directoryPattern(dir: string, style: PathStyle): string {
  return foldersOf(dir, style).map(folderPattern).join(separatorPattern(style));
}

function folderPattern(folder: string): string {
  const spellings = new Set<string>();
  for (const form of [folder, folder.normalize("NFC"), folder.normalize("NFD")]) {
    spellings.add(form);
    spellings.add(urlEncoded(form));
  }
  const escaped = [...spellings].map(escapeRegExp);
  return escaped.length === 1 ? (escaped[0] ?? "") : `(?:${escaped.join("|")})`;
}

function urlEncoded(folder: string): string {
  let encoded = "";
  for (const character of folder) {
    const code = character.codePointAt(0) ?? 0;
    const escaped = code <= 0x20 || code >= 0x7f || URL_PUNCTUATION.has(character);
    encoded += escaped ? percentBytes(character) : character;
  }
  return encoded;
}

function percentBytes(character: string): string {
  let encoded = "";
  for (const byte of UTF8.encode(character)) {
    encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
