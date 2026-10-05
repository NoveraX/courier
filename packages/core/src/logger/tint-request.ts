import type { TerminalStyle } from "../terminal/terminal-style";

const METHOD = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|QUERY) /;
const OUTCOME = / → (\d{3}|ERROR) \((\d+ms)\)$/;

/* The status colours Studio uses: success, redirect, client error, server error. */
function tone(status: string, style: TerminalStyle): string {
  if (status === "ERROR") return style.red(status);
  const code = Number(status);
  if (code >= 500) return style.magenta(status);
  if (code >= 400) return style.red(status);
  if (code >= 300) return style.yellow(status);
  return style.green(status);
}

/**
 * A request line as a terminal shows it: `GET /users → 404 (3ms)` from the
 * mock server, or `api:users:list → 200 (12ms)` from the log middleware.
 * The status takes its class's colour, the arrow and the time are dimmed,
 * and a leading method is padded so the paths after it line up. Any other
 * message comes back as it is.
 *
 * @param message - The line's text
 * @param style - The style of the stream it is written to
 * @returns The text, tinted when it is a request line
 * @example
 * ```ts
 * tintRequest("GET /users → 404 (3ms)", style); // "GET    /users → 404 (3ms)", 404 in red
 * ```
 */
export function tintRequest(message: string, style: TerminalStyle): string {
  const outcome = OUTCOME.exec(message);
  if (outcome === null) return message;
  const [tail, status = "", took = ""] = outcome;
  const subject = message.slice(0, -tail.length);
  const method = METHOD.exec(subject);
  const aligned =
    method === null ? subject : `${(method[1] ?? "").padEnd(6)} ${subject.slice(method[0].length)}`;
  return `${aligned} ${style.dim("→")} ${style.bold(tone(status, style))} ${style.dim(`(${took})`)}`;
}
