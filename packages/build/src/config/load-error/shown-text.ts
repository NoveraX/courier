import { maskEnvironmentValues } from "./mask-env-values";

/** The longest part of the project's own message a load error quotes, in characters. */
const MAX_QUOTED_LENGTH = 300;

/* The character that opens a terminal's control sequences: colours, moves. */
const ESCAPE = 0x1b;

/**
 * The first line of a message the project's code wrote, as a load error
 * quotes it: the environment's values masked, terminal codes and control
 * characters taken out, and cut short past 300 characters.
 *
 * @param text - The message
 * @returns The line to quote
 * @example
 * ```ts
 * shownText("Invalid environment variables\n  DATABASE_URL: Required"); // "Invalid environment variables"
 * ```
 */
export function shownText(text: string): string {
  const line = maskEnvironmentValues(text.split("\n", 1)[0] ?? "");
  const plain = withoutControls(line).trim();
  return plain.length > MAX_QUOTED_LENGTH ? `${plain.slice(0, MAX_QUOTED_LENGTH)}…` : plain;
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
