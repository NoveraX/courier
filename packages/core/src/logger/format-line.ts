import type { TerminalStyle } from "../terminal/terminal-style";
import { scopeName } from "./scope-name";
import { tintRequest } from "./tint-request";
import type { LogLevel } from "./types";

/* Wide enough for every scope Courier logs under, `webpack-plugin` aside,
   so the messages of one process line up. */
const SCOPE_WIDTH = 13;
const BRAND = "courier:";

const LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function clock(): string {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

/* The lines after a message's first start under it, not at the margin. */
function hang(message: string, indent: number): string {
  return message.includes("\n") ? message.replaceAll("\n", `\n${" ".repeat(indent)}`) : message;
}

function mark(level: LogLevel, { bold, brand, red, yellow, glyphs }: TerminalStyle): string {
  if (level === "info") return bold(brand(glyphs.info));
  if (level === "warn") return bold(yellow(glyphs.warn));
  if (level === "error") return bold(red(glyphs.error));
  return glyphs.debug;
}

/**
 * One terminal log line: the time, the level, `courier:` and the scope, and
 * the message.
 *
 * Where the stream shows colour, the level is a symbol in its colour — `●`
 * info, `▲` warn, `✕` error, `·` debug, the whole debug line dimmed — and a
 * request line has its status tinted; the message keeps the terminal's own
 * foreground, so it reads on a light theme as on a dark one. Without colour
 * — a pipe, a log file — the level is a word, for a reader and for grep:
 *
 *   19:03:59 ▲ courier:proxy          Upstream request failed
 *   19:03:59 WARN  courier:proxy          Upstream request failed
 *
 * @param level - The line's level
 * @param context - What wrote it
 * @param message - The text; a second line starts under the first
 * @param style - The style of the stream it is written to
 * @returns The line, without a trailing newline
 * @example
 * ```ts
 * formatLine("info", "MockServer", "GET /users → 200 (4ms)", styleFor(process.stdout));
 * ```
 */
export function formatLine(
  level: LogLevel,
  context: string,
  message: string,
  style: TerminalStyle,
): string {
  const time = clock();
  const scope = scopeName(context).padEnd(SCOPE_WIDTH);
  if (style.level === 0) {
    const head = `${time} ${LABELS[level]} ${BRAND}${scope}  `;
    return `${head}${hang(message, head.length)}`;
  }
  const body = hang(message, time.length + 3 + BRAND.length + scope.length + 2);
  if (level === "debug")
    return style.dim(`${time} ${mark(level, style)} ${BRAND}${scope}  ${body}`);
  const text = level === "info" ? tintRequest(body, style) : body;
  return `${style.dim(time)} ${mark(level, style)} ${style.dim(BRAND)}${scope}  ${text}`;
}
