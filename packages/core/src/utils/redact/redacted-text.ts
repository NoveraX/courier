import { REDACT_BOUNDS } from "./bounds";
import { cutText } from "./cut-text";

/**
 * A text with what could be a credential cut out, as {@link redact} reads
 * one: the text itself where only the space around it would change, so a
 * value that held nothing to cut comes back as it was.
 *
 * @param text - The text
 * @returns The text, or the text as cut
 * @example
 * ```ts
 * redactedText("AggregateError: "); // → "AggregateError: ", as it was
 * redactedText("password=hunter2"); // → "password=[redacted]"
 * ```
 */
export function redactedText(text: string): string {
  const cut = cutText(text, REDACT_BOUNDS.text);
  return cut === text.trim() ? text : cut;
}
