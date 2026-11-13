/** A release's version, as npm writes it: major, minor, patch, and a pre-release tag where it has one. */
export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** `beta.1` of `0.5.0-beta.1`; empty for a release. */
  readonly pre: string;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * A version read from its text.
 *
 * @param text - `0.5.0`, `v0.5.0`, `0.5.0-beta.1`
 * @returns The version, or `undefined` for text that is none
 * @example
 * ```ts
 * parseVersion("0.5.0-beta.1"); // { major: 0, minor: 5, patch: 0, pre: "beta.1" }
 * ```
 */
export function parseVersion(text: string): Version | undefined {
  const found = VERSION.exec(text.trim());
  if (found === null) return undefined;
  const [, major = "0", minor = "0", patch = "0", pre = ""] = found;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), pre };
}

/**
 * Which of two versions comes first, as npm orders them: a pre-release
 * before its release.
 *
 * @param a - A version
 * @param b - Another
 * @returns Below 0 where `a` comes first, above 0 where `b` does, 0 where they are one
 * @example
 * ```ts
 * compareVersions(parseVersion("0.4.2")!, parseVersion("0.5.0")!); // -1
 * ```
 */
export function compareVersions(a: Version, b: Version): number {
  const order = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (order !== 0) return Math.sign(order);
  if (a.pre === b.pre) return 0;
  if (a.pre === "") return 1;
  if (b.pre === "") return -1;
  return comparePre(a.pre.split("."), b.pre.split("."));
}

/* Pre-release tags, part by part: a number before a word, numbers by value, words as text, and the shorter first where one runs out. */
function comparePre(a: readonly string[], b: readonly string[]): number {
  for (let at = 0; at < Math.min(a.length, b.length); at++) {
    const [x = "", y = ""] = [a[at], b[at]];
    if (x === y) continue;
    const [xNumber, yNumber] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (xNumber && yNumber) return Math.sign(Number(x) - Number(y));
    if (xNumber !== yNumber) return xNumber ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}

/**
 * A version as npm writes it.
 *
 * @param version - The version
 * @returns Its text
 * @example
 * ```ts
 * formatVersion({ major: 0, minor: 5, patch: 0, pre: "" }); // "0.5.0"
 * ```
 */
export function formatVersion(version: Version): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.pre === "" ? base : `${base}-${version.pre}`;
}
