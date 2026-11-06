import { redact } from "@noverax/courier";

import { maskEnvironmentValues } from "./mask-env-values";

/** The longest part of the project's own message a load error quotes, in characters. */
const MAX_QUOTED_LENGTH = 300;

/* The character that opens a terminal's control sequences: colours, moves. */
const ESCAPE = 0x1b;

/**
 * The first line of a message the project's code wrote, as a load error
 * quotes it: the environment's values masked, terminal codes and control
 * characters taken out, every credential cut, and cut short past 300
 * characters. The values are masked first, in the whole text as the code
 * wrote it, since a value is found only as it stands — a line break, a
 * control character and all. The codes go before the credentials:
 * `redact()` reads a control character as a space, which would leave a
 * code's text behind.
 *
 * @param text - The message
 * @returns The line to quote
 * @example
 * ```ts
 * shownText("Invalid environment variables\n  DATABASE_URL: Required"); // "Invalid environment variables"
 * ```
 */
export function shownText(text: string): string {
  const masked = maskEnvironmentValues(text);
  const plain = withoutControls(masked.split("\n", 1)[0] ?? "");
  const line = redact(plain).trim();
  return line.length > MAX_QUOTED_LENGTH ? `${line.slice(0, MAX_QUOTED_LENGTH)}…` : line;
}

/* The text without the codes a terminal reads — ESC, "[", parameters, a final letter — or any other control character. */
function withoutControls(text: string): string {
  let shown = "";
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code === ESCAPE && text[at + 1] === "[") {
      at += 2;
      while (at < text.length && !/[A-Za-z]/.test(text[at] ?? "")) at += 1;
      continue;
    }
    if (code >= 0x20 && code !== 0x7f) shown += text[at];
  }
  return shown;
}
