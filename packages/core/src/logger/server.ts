/**
 * Server logger — ANSI escape codes with structured prefix.
 *
 * Output format:
 *   [Nexus] PID – HH:MM:SS   LEVEL  [Context] message
 */

import type { Logger, LogLevel } from "./types";

const R = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const fg = (r: number, g: number, b: number): string => `\x1b[38;2;${r};${g};${b}m`;

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

function ts(): string {
  const d = new Date();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function log(level: LogLevel, context: string, message: string, cause?: unknown): void {
  const color = LEVEL_COLORS[level];
  const label = LEVEL_LABELS[level];
  const pid = process.pid;
  const suffix = cause != null ? `${DIM} ${cause}${R}` : "";
  const line = `${BRAND}[Nexus]${R} ${WHITE}${pid}${R}  ${DARK}–${R} ${DIM}${ts()}${R}   ${color}${BOLD}${label}${R}  ${PURPLE}[${context}]${R} ${WHITE}${message}${R}${suffix}`;
  process.stdout.write(`${line}\n`);
}

export const serverLogger: Logger = {
  debug: (ctx, msg, cause) => log("debug", ctx, msg, cause),
  info: (ctx, msg, cause) => log("info", ctx, msg, cause),
  warn: (ctx, msg, cause) => log("warn", ctx, msg, cause),
  error: (ctx, msg, cause) => log("error", ctx, msg, cause),
};
