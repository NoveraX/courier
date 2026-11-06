import { appendedText, withoutBom } from "./append-text";

/** The line that opens Courier's block in AGENTS.md. */
export const AGENT_RULES_BEGIN = "<!-- BEGIN:courier-agent-rules -->";

/** The line that closes it. */
export const AGENT_RULES_END = "<!-- END:courier-agent-rules -->";

/**
 * Courier's block in AGENTS.md, its markers included, its lines joined by
 * LF: it points the agent in the project's editor at the docs of the
 * Courier the project installs, which `@noverax/courier-docs` holds in
 * `node_modules`.
 */
export const AGENT_RULES: string = [
  AGENT_RULES_BEGIN,
  "## Courier in this project",
  "",
  "Courier changes between versions, and its APIs may differ from what you know of it. Before writing or changing code that uses an `@noverax/*` package, read the relevant page of the documentation installed with this project, in `node_modules/@noverax/courier-docs/docs/`: `index.md` lists every page, and they match the installed version. In a monorepo, look in the `node_modules` of the package that uses Courier.",
  "",
  "Courier keeps this block up to date while it is here, and leaves the rest of this file alone. Delete the block, markers included, and nothing writes it again.",
  AGENT_RULES_END,
].join("\n");

/* Where the block stands in a text, its BOM left out: nowhere, between one pair of markers, or why its markers cannot be told apart. */
type Place =
  | { readonly kind: "none" }
  | { readonly kind: "block"; readonly start: number; readonly end: number; readonly eol: string }
  | { readonly kind: "broken"; readonly why: string };

/* Where a marker stands, twice at most: a third tells nothing a second does not. */
function firstTwo(text: string, marker: string): number[] {
  const first = text.indexOf(marker);
  if (first === -1) return [];
  const second = text.indexOf(marker, first + marker.length);
  return second === -1 ? [first] : [first, second];
}

/* The line a marker stands on: where it starts, where its text ends, before its line end, and its text. */
function lineAt(text: string, at: number): { start: number; end: number; text: string } {
  const start = text.lastIndexOf("\n", at) + 1;
  const next = text.indexOf("\n", at);
  const stop = next === -1 ? text.length : next;
  const end = text[stop - 1] === "\r" ? stop - 1 : stop;
  return { start, end, text: text.slice(start, end) };
}

function placeOf(text: string): Place {
  const begins = firstTwo(text, AGENT_RULES_BEGIN);
  const ends = firstTwo(text, AGENT_RULES_END);
  const broken = (why: string): Place => ({ kind: "broken", why });
  if (begins.length === 0 && ends.length === 0) return { kind: "none" };
  if (begins.length > 1) return broken("it holds Courier's BEGIN marker more than once");
  if (ends.length > 1) return broken("it holds Courier's END marker more than once");
  const [begin] = begins;
  const [end] = ends;
  if (begin === undefined) return broken("it holds Courier's END marker without its BEGIN");
  if (end === undefined) return broken("it holds Courier's BEGIN marker without its END");
  if (end < begin) return broken("Courier's END marker comes before its BEGIN");
  const opening = lineAt(text, begin);
  const closing = lineAt(text, end);
  if (opening.text.trim() !== AGENT_RULES_BEGIN || closing.text.trim() !== AGENT_RULES_END)
    return broken("a marker of Courier's shares its line with other text");
  const eol = text.startsWith("\r\n", opening.end) ? "\r\n" : "\n";
  return { kind: "block", start: opening.start, end: closing.end, eol };
}

/* A block's words, its spacing aside: one a formatter wrapped, or whose line ends it changed, reads as the same. */
function wordsOf(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

/* The block, its lines ended as the file's are. */
function blockWith(eol: string): string {
  return eol === "\n" ? AGENT_RULES : AGENT_RULES.split("\n").join(eol);
}

/**
 * Why Courier's block cannot be written into a text: one of its markers
 * there more than once, one without the other, the two out of order, or
 * one sharing its line with other text. Such a file is left as it is.
 *
 * @param text - The file's text
 * @returns Why, as a clause, or `undefined` where the block can be written
 * @example
 * ```ts
 * agentRulesProblem(`${AGENT_RULES}\n${AGENT_RULES}\n`); // "it holds Courier's BEGIN marker more than once"
 * ```
 */
export function agentRulesProblem(text: string): string | undefined {
  const place = placeOf(withoutBom(text).body);
  return place.kind === "broken" ? place.why : undefined;
}

/**
 * A text with Courier's block brought up to date between its markers,
 * for Studio as it starts and the upgrade: the rest of the text, its BOM
 * and its line ends as they were. A block that differs only in its
 * spacing — lines a formatter wrapped — is up to date already.
 *
 * @param text - The file's text
 * @returns The text with the block brought up to date, or `null` where there is nothing to do: no block, one up to date, or markers {@link agentRulesProblem} names
 * @example
 * ```ts
 * updatedAgentRules(`# Rules\n\n${AGENT_RULES}\n`); // null: the block is up to date
 * ```
 */
export function updatedAgentRules(text: string): string | null {
  const { bom, body } = withoutBom(text);
  const place = placeOf(body);
  if (place.kind !== "block") return null;
  if (wordsOf(body.slice(place.start, place.end)) === wordsOf(AGENT_RULES)) return null;
  return `${bom}${body.slice(0, place.start)}${blockWith(place.eol)}${body.slice(place.end)}`;
}

/**
 * A text with Courier's block written in, as `create-courier` and
 * `courier-cli setup` write it once the person agrees: added at its end,
 * after an empty line, where it has none — a new file is the block alone
 * — or brought up to date between its markers. Nothing outside them
 * changes; the BOM and the line ends stay as they were.
 *
 * @param text - The file's text, `""` for a new file
 * @returns The text with the block, the text itself where it holds the block already, or `undefined` where its markers are such as {@link agentRulesProblem} names
 * @example
 * ```ts
 * withAgentRules("# Rules\n"); // `# Rules\n\n${AGENT_RULES}\n`
 * ```
 */
export function withAgentRules(text: string): string | undefined {
  const { bom, body } = withoutBom(text);
  const place = placeOf(body);
  if (place.kind === "broken") return undefined;
  if (place.kind === "block") return updatedAgentRules(text) ?? text;
  return `${bom}${appendedText(body, AGENT_RULES)}`;
}
