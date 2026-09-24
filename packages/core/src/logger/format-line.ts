import type { LogLevel } from "./types";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

const BRAND = fg(139, 92, 246);
const WHITE = fg(229, 231, 235);
const DARK = fg(63, 63, 70);
const PURPLE = fg(167, 139, 250);

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: fg(113, 113, 122),
  info: fg(52, 211, 153),
  warn: fg(251, 191, 36),
  error: fg(248, 113, 113),
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: " INFO",
  warn: " WARN",
  error: "ERROR",
};

function clock(): string {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

/**
 * One terminal log line: `[Courier] PID - HH:MM:SS  LEVEL  [Context] message`.
 *
 * The PID is left out where there is no process to name — a Web Worker, or an
 * edge runtime without Node compatibility.
 *
 * @param level - The line's level
 * @param context - What wrote it
 * @param message - The text, kept verbatim
 * @param colored - Whether to add escape codes
 * @returns The line, without a trailing newline
 */
export function formatLine(
  level: LogLevel,
  context: string,
  message: string,
  colored: boolean,
): string {
  const paint = (code: string, text: string): string => (colored ? `${code}${text}${RESET}` : text);
  const pid = globalThis.process?.pid;
  const origin = pid === undefined ? "" : `${paint(WHITE, String(pid))}  ${paint(DARK, "-")} `;
  const label = paint(`${LEVEL_COLORS[level]}${BOLD}`, LEVEL_LABELS[level]);
  return `${paint(BRAND, "[Courier]")} ${origin}${paint(DIM, clock())}   ${label}  ${paint(PURPLE, `[${context}]`)} ${paint(WHITE, message)}`;
}
