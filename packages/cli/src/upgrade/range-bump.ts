import { formatVersion, type Version } from "./versions";

/** A range as an upgrade writes it, or why it is left as written. */
export type RangeBump = { readonly to: string } | { readonly why: string };

/* An exact version, a caret or a tilde, with the parts it writes: `^0.4.0`, `~0.4`, `0.4.0`, `=0.4.0`. */
const SIMPLE = /^(\^|~|=|v)?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(-[0-9A-Za-z.-]+)?$/;

/* The target, written with as many parts as the range wrote: `^0.4` raises to `^0.5`. */
function withParts(target: Version, parts: number): string {
  if (parts === 1) return String(target.major);
  if (parts === 2) return `${target.major}.${target.minor}`;
  return formatVersion(target);
}

/* Why a range of another kind is left as the person wrote it, and what they write in its place. */
function whyLeft(range: string, target: Version): string {
  const written = formatVersion(target);
  if (/^(?:workspace|file|link|portal):/.test(range)) return "a package of the project's own";
  if (/^npm:/.test(range)) return `an alias: write npm:<package>@^${written} in its place`;
  if (/^(?:git\+|git:|github:|https?:)|\.git(?:#|$)/.test(range)) return "a git or URL source";
  if (/^(?:\*|x|latest|)$/i.test(range.trim())) return `it allows ${written}`;
  return `a range the upgrade does not rewrite: write ^${written} in its place`;
}

/**
 * A package's range as an upgrade writes it for the target release: the
 * same kind of range — an exact version stays exact, a caret a caret, a
 * tilde a tilde, with as many parts — at the target. Any other range is
 * left as written, and says why: one that allows any release, a package
 * of the project's own, an alias, a git source, or a range of comparators,
 * which the person writes again.
 *
 * @param range - The range as the manifest writes it
 * @param target - The release to move to
 * @returns The range to write, or why it is left as written
 * @example
 * ```ts
 * bumpRange("^0.4.0", parseVersion("0.5.0")!); // { to: "^0.5.0" }
 * bumpRange(">=0.3 <0.5", parseVersion("0.5.0")!); // { why: "a range the upgrade does not rewrite: write ^0.5.0 in its place" }
 * ```
 */
export function bumpRange(range: string, target: Version): RangeBump {
  const simple = SIMPLE.exec(range.trim());
  if (simple === null) return { why: whyLeft(range, target) };
  const [, prefix = "", major = "", minor, patch] = simple;
  const kept = prefix === "=" || prefix === "v" ? "" : prefix;
  /* `0.x` allows every 0 release; `0.4.x` is the 0.4 line, raised as `0.5.x`. */
  if (minor === "x" || minor === "*") {
    return Number(major) === target.major
      ? { why: `it allows ${formatVersion(target)}` }
      : { to: `${kept}${target.major}.${minor}` };
  }
  if (patch === "x" || patch === "*")
    return { to: `${kept}${target.major}.${target.minor}.${patch}` };
  const parts = patch !== undefined ? 3 : minor !== undefined ? 2 : 1;
  return { to: `${kept}${withParts(target, parts)}` };
}
