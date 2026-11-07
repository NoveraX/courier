/* The most patterns a pattern's braces write out: past it, the pattern is read as every file under its folder. */
const MAX_WRITTEN = 64;
/* What a glob's folder ends before: the first segment that holds its syntax; `!`, `@` and `+` are syntax only before `(`, as an alias starts with `@`. */
const SYNTAX = /[*?[\]{}()\\]|[!@+]\(/;

/* A test of one character of a segment. */
type Char = (char: string) => boolean;
/* A segment's pattern: `*`, any run of characters, or a test of one. */
type Token = "*" | Char;
/* A pattern's segments: `**`, any run of segments, or a segment's tokens. */
type Part = "**" | readonly Token[];

/**
 * A glob's pattern, split where its syntax starts: the folder written
 * before it, as a specifier names a path, and the rest, matched against
 * each path under that folder. A pattern with no syntax names one file:
 * its folder, and its name.
 *
 * @param pattern - The pattern, without the `!` that leaves its files out
 * @returns The folder, `""` where the pattern starts with its syntax, and the rest
 * @example
 * ```ts
 * globHead("./pages/**\/*.tsx"); // { folder: "./pages", rest: "**\/*.tsx" }
 * ```
 */
export function globHead(pattern: string): { readonly folder: string; readonly rest: string } {
  const segments = pattern.split("/");
  const at = segments.findIndex((segment) => SYNTAX.test(segment));
  const end = at === -1 ? segments.length - 1 : at;
  return { folder: segments.slice(0, end).join("/"), rest: segments.slice(end).join("/") };
}

/* The first brace that holds alternatives, or a range it does not write out; none where the pattern has neither. */
function firstBrace(
  pattern: string,
):
  | { readonly start: number; readonly end: number; readonly parts: string[] }
  | "range"
  | undefined {
  for (let start = 0; start < pattern.length; start++) {
    if (pattern[start] === "\\") start++;
    else if (pattern[start] === "{") {
      const parts: string[] = [];
      let [depth, from, end] = [0, start + 1, -1];
      for (let at = start; at < pattern.length && end === -1; at++) {
        const char = pattern[at];
        if (char === "\\") at++;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) end = at;
        else if (char === "," && depth === 1) {
          parts.push(pattern.slice(from, at));
          from = at + 1;
        }
      }
      if (end === -1) return undefined;
      parts.push(pattern.slice(from, end));
      if (parts.length > 1) return { start, end, parts };
      if (/^[^.]+\.\.[^.]+/.test(parts[0] ?? "")) return "range";
      start = end;
    }
  }
  return undefined;
}

/* A pattern with its braces written out, the nested ones too; none past the limit, or for a range. */
function writtenOut(pattern: string): string[] | undefined {
  const done: string[] = [];
  const queue = [pattern];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const brace = firstBrace(next);
    if (brace === "range") return undefined;
    if (brace === undefined) done.push(next);
    else
      for (const part of brace.parts)
        queue.push(`${next.slice(0, brace.start)}${part}${next.slice(brace.end + 1)}`);
    if (done.length + queue.length > MAX_WRITTEN) return undefined;
  }
  return done;
}

/* A `[…]` class's test: its characters and ranges, or the characters it leaves out after `!` or `^`. */
function classOf(inner: string): Char | undefined {
  if (inner.includes("[:")) return undefined;
  const negated = inner.startsWith("!") || inner.startsWith("^");
  const body = negated ? inner.slice(1) : inner;
  const ranges: Array<readonly [string, string]> = [];
  for (let at = 0; at < body.length; at++) {
    const from = body[at] === "\\" ? (body[++at] ?? "") : (body[at] ?? "");
    const ranged = body[at + 1] === "-" && at + 2 < body.length;
    ranges.push(ranged ? [from, body[at + 2] ?? ""] : [from, from]);
    if (ranged) at += 2;
  }
  return (char) => ranges.some(([low, high]) => char >= low && char <= high) !== negated;
}

/* A segment's tokens; none for syntax the upgrade does not read: an extglob, a group, a POSIX class. */
function tokensOf(segment: string): Token[] | undefined {
  const tokens: Token[] = [];
  for (let at = 0; at < segment.length; at++) {
    const char = segment[at] ?? "";
    const next = segment[at + 1];
    if ("()|".includes(char) || ("@!+*?".includes(char) && next === "(")) return undefined;
    if (char === "\\") {
      const escaped = segment[++at] ?? "";
      tokens.push((each) => each === escaped);
    } else if (char === "*") {
      if (tokens.at(-1) !== "*") tokens.push("*");
    } else if (char === "?") tokens.push(() => true);
    else if (char === "[" && segment.indexOf("]", at + 2) !== -1) {
      const end = segment.indexOf("]", at + 2);
      const test = classOf(segment.slice(at + 1, end));
      if (test === undefined) return undefined;
      tokens.push(test);
      at = end;
    } else tokens.push((each) => each === char);
  }
  return tokens;
}

/*
 * Whether a run of items matches a run of tokens, `*` taking any run of
 * items and each other token one: the walk keeps the last `*` alone and
 * moves it on one item at a time, so it costs the items times the tokens
 * at most, however many `*` there are.
 */
function matched<Item, Of>(
  tokens: readonly (Of | "*")[],
  items: readonly Item[],
  fits: (token: Of, item: Item) => boolean,
): boolean {
  let [item, token, star, from] = [0, 0, -1, 0];
  while (item < items.length) {
    const each = tokens[token];
    if (each !== undefined && each !== "*" && fits(each, items[item] as Item)) {
      item++;
      token++;
    } else if (each === "*") {
      star = token++;
      from = item;
    } else if (star !== -1) {
      token = star + 1;
      item = ++from;
    } else return false;
  }
  while (tokens[token] === "*") token++;
  return token === tokens.length;
}

/**
 * A test of a path under a glob's folder against the rest of its
 * pattern: `*`, `?` and `[…]` within a segment, `**` across them, braces
 * written out. Dot folders and files are matched too, so the upgrade
 * reads more files of a glob than Vite does without `exhaustive`, never
 * fewer.
 *
 * @param rest - The pattern after its folder
 * @param anyCase - Whether case is read as the same, as `caseSensitive: false` asks
 * @returns The test, of a path relative to the folder; none where the pattern holds syntax the upgrade does not read, which then names every file under its folder
 * @example
 * ```ts
 * globTest("**\/*.{ts,tsx}", false)?.("admin/users.tsx"); // true
 * ```
 */
export function globTest(rest: string, anyCase: boolean): ((path: string) => boolean) | undefined {
  const cased = (text: string) => (anyCase ? text.toLowerCase() : text);
  const patterns = writtenOut(cased(rest));
  if (patterns === undefined) return undefined;
  const parted: Part[][] = [];
  for (const pattern of patterns) {
    const parts: Part[] = [];
    for (const segment of pattern.split("/")) {
      const tokens = segment === "**" ? "**" : tokensOf(segment);
      if (tokens === undefined) return undefined;
      if (tokens !== "**" || parts.at(-1) !== "**") parts.push(tokens);
    }
    parted.push(parts);
  }
  return (path) => {
    const segments = cased(path).split("/");
    return parted.some((parts) =>
      matched(
        parts.map((part) => (part === "**" ? "*" : part)),
        segments,
        (tokens: readonly Token[], segment: string) =>
          matched(tokens, [...segment], (char: Char, each: string) => char(each)),
      ),
    );
  };
}
