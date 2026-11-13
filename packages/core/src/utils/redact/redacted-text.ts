import { REDACT_BOUNDS } from "./bounds";
import { cutText } from "./cut-text";

/* What else the process cuts from each text: nothing, unless it knows secrets these rules cannot. */
let cutToo: ((text: string) => string) | undefined;

/**
 * Have {@link redact} cut from every text, past what its rules cut, what
 * `cut` cuts: secrets the process alone knows of, as a process that runs a
 * project's code knows the values of its environment. Each line the logger
 * writes is cut by it too, whoever logged it; `undefined` cuts by the rules
 * alone again.
 *
 * @param cut - What else to cut from a text
 * @example
 * ```ts
 * redactAlso((text) => text.replaceAll(apiKey, "[redacted]"));
 * ```
 */
export function redactAlso(cut: ((text: string) => string) | undefined): void {
  cutToo = cut;
}

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
  const said = cut === text.trim() ? text : cut;
  return cutToo === undefined ? said : cutToo(said);
}
