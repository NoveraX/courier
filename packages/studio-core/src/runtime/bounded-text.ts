/* The most of an error's text an event carries: a text that holds a whole answer would flood the socket. */
const MAX_TEXT = 8000;

/**
 * An error's text as an event carries it to Studio: whole — the page that
 * holds Studio's token shows it as the app said it, and Studio cuts what
 * leaves that page — up to 8000 characters, past which it ends with "…".
 *
 * @param text - The error's text
 * @returns The text, no longer than an event carries
 * @example
 * ```ts
 * boundedText(error.message); // the message, or its first 7999 characters and "…"
 * ```
 */
export function boundedText(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}
