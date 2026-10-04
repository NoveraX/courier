/** The role a piece of code plays, which picks its colour. */
export type CodeTone =
  | "keyword"
  | "function"
  | "string"
  | "type"
  | "number"
  | "plain"
  | "punctuation"
  | "space";

/** A piece of a code line and its role. */
export interface CodeToken {
  text: string;
  tone: CodeTone;
}

const KEYWORDS: ReadonlySet<string> = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "type",
  "as",
  "async",
  "await",
  "function",
  "return",
  "if",
  "new",
  "for",
  "of",
  "curl",
  "websocat",
]);

const PIECES = /("(?:[^"\\]|\\.)*"|'[^']*'|`[^`]*`)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$"'`]+)/g;

/**
 * Split a line of TypeScript or a shell command into pieces to colour:
 * strings, keywords and a command's flags, a name followed by `(` as a
 * call, a capitalised name as a type, the rest as plain names and
 * punctuation. A light pass — the snippets Studio shows are short and well
 * formed.
 *
 * @param line - One line of code
 * @returns Its pieces, in order
 * @example
 * ```ts
 * tokenizeLine('import { x } from "y";')[0]; // { text: "import", tone: "keyword" }
 * ```
 */
export function tokenizeLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  for (const match of line.matchAll(PIECES)) {
    const [text, quoted, name, space] = match;
    if (quoted) tokens.push({ text, tone: "string" });
    else if (name) {
      const next = line[(match.index ?? 0) + name.length];
      const flag = line[(match.index ?? 0) - 1] === "-";
      const tone =
        KEYWORDS.has(name) || flag
          ? "keyword"
          : next === "("
            ? "function"
            : /^[A-Z]/.test(name)
              ? "type"
              : "plain";
      tokens.push({ text, tone });
    } else if (space) tokens.push({ text, tone: "space" });
    else tokens.push({ text, tone: "punctuation" });
  }
  return tokens;
}
