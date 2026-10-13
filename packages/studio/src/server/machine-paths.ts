import { foldersOf } from "./folders-of";
import { pathPattern } from "./path-pattern";
import { type PathStyle, PLATFORM_STYLE } from "./path-style";

/** The directories a text should not name as they are on this machine, each by every name it goes by. */
export interface MachinePaths {
  /** The project's directory: a path in it is named relative to it. */
  project: readonly string[];
  /** The home directory, named `~`; none to leave such paths whole. */
  home?: string | readonly string[] | undefined;
  /** The temporary directory, named `<temp>`; none to leave such paths whole. */
  temp?: string | readonly string[] | undefined;
}

/* What the project's directory itself is named, in words a sentence reads:
   "There is no courier.config in the project root, so …". */
const PROJECT_ROOT_NAME = "the project root";

interface Rule {
  dir: string;
  /** How many folders deep the directory is: the deeper one is tried first. */
  depth: number;
  name: (rest: string) => string;
}

/**
 * Build what takes this machine's directories off the paths a text names: a
 * path in the project is named relative to it — the directory itself as
 * "the project root" — any other under the home directory from `~`,
 * and under the temporary directory from `<temp>`, with forward slashes.
 * The deepest directory a path lies in names it, so a project inside the
 * home directory reads relative, not from `~`. A path is found as a
 * platform's texts write it — in a `file:` URL, and on Windows with either
 * slash or as JSON escapes it — and in any letter case where the platform
 * ignores case. A directory named alone ends wherever its name does not go
 * on, a JSON escape after it included, which is kept as it was written, so
 * JSON stays JSON.
 *
 * @param paths - The directories to take off
 * @param style - How the platform spells paths; this platform's by default
 * @returns What rewrites a text
 * @example
 * ```ts
 * const shown = pathScrubber({ project: ["/Users/ana/shop"], home: "/Users/ana" });
 * shown("ENOENT: no such file or directory, realpath '/Users/ana/shop/specs/x'"); // → "…, realpath 'specs/x'"
 * shown("Cannot find module '/Users/ana/.npm/x.js'"); // → "Cannot find module '~/.npm/x.js'"
 * ```
 */
export function pathScrubber(
  paths: MachinePaths,
  style: PathStyle = PLATFORM_STYLE,
): (text: string) => string {
  const rules = rulesOf(paths, style);
  if (rules.length === 0) return (text) => text;
  const dirs = rules.map(({ dir }) => dir);
  const pattern = new RegExp(pathPattern(dirs, style), style.caseless ? "giu" : "gu");
  /* The groups are each directory's, in the rules' order, then the separator
     after it and the rest of the path. */
  return (text) =>
    text.replace(pattern, (match: string, ...groups: unknown[]) => {
      const index = groups.findIndex((group, at) => at < rules.length && group !== undefined);
      const rule = rules[index];
      if (rule === undefined) return match;
      const separator = textOf(groups[rules.length]);
      const rest = textOf(groups[rules.length + 1]);
      return pathNamed(rule, textOf(groups[index]), { separator, rest }, style);
    });
}

/* On Windows with forward slashes. A directory written with its backslashes
   doubled is in JSON-escaped text, where a lone backslash after it escapes
   what follows — the `\n` of a line break, the `\"` of a quote — and stays. */
function pathNamed(
  rule: Rule,
  dir: string,
  { separator, rest }: { separator: string; rest: string },
  style: PathStyle,
): string {
  if (!style.windows) return rule.name(rest);
  const escaped = dir.includes("\\\\");
  if (escaped && separator === "\\") return `${rule.name("")}\\${rest}`;
  return rule.name(forwardSlashes(rest, escaped));
}

/* Each directory once, by the first naming it has — the project's before the
   home directory's — and the deepest first. */
function rulesOf(paths: MachinePaths, style: PathStyle): Rule[] {
  const rules = new Map<string, Rule>();
  for (const { dir, name } of namings(paths)) {
    const folders = foldersOf(dir, style);
    const key = caseOf(folders.join("/"), style);
    if (isNamed(folders, style) && !rules.has(key)) {
      rules.set(key, { dir, depth: folders.length, name });
    }
  }
  return [...rules.values()].sort((a, b) => b.depth - a.depth || b.dir.length - a.dir.length);
}

function namings(paths: MachinePaths): Array<Pick<Rule, "dir" | "name">> {
  return [
    ...paths.project.map((dir) => ({ dir, name: (rest: string) => rest || PROJECT_ROOT_NAME })),
    ...listOf(paths.home).map((dir) => ({ dir, name: (rest: string) => under("~", rest) })),
    ...listOf(paths.temp).map((dir) => ({ dir, name: (rest: string) => under("<temp>", rest) })),
  ];
}

/* Backslashes between names separate folders. A run at the very end escapes
   the quote that follows, as JSON writes it, and stays. Each run is tried
   from its first backslash only, so a text of backslashes is read once. */
const SEPARATORS = /(?<!\\)\\+(?=[^\\])/g;
/* In JSON-escaped text each separator is doubled, and a lone backslash
   escapes what follows and stays: `\\\n` is a separator, then a line break. */
const ESCAPED_SEPARATORS = /(?<!\\)(?:\\\\)+(?=\\?[^\\])/g;

function forwardSlashes(rest: string, escaped: boolean): string {
  return rest.replace(escaped ? ESCAPED_SEPARATORS : SEPARATORS, "/");
}

function textOf(group: unknown): string {
  return typeof group === "string" ? group : "";
}

function under(name: string, rest: string): string {
  return rest ? `${name}/${rest}` : name;
}

/* A file system's root names every path: taking it off would rewrite them all. */
function isNamed(folders: readonly string[], style: PathStyle): boolean {
  return folders.slice(style.windows ? 1 : 0).some((folder) => folder !== "");
}

function caseOf(key: string, style: PathStyle): string {
  return style.caseless ? key.toLowerCase() : key;
}

function listOf(names: string | readonly string[] | undefined): readonly string[] {
  if (names === undefined) return [];
  return typeof names === "string" ? [names] : names;
}
