/**
 * Text a command prints as a terminal shows it, character for character:
 * one the terminal would act on rather than show — a C0 or C1 control, DEL,
 * a line or paragraph separator, a bidirectional embedding, override or
 * isolate — is written as its escape, `\u001b`. A specification's paths,
 * names and references reach the lines `courier-studio import` prints, and
 * one holding such a character set the terminal's title, cleared its
 * screen, or reordered the line it was on.
 *
 * @param text - The text, such as a path a specification gives
 * @returns The text with every such character escaped
 * @example
 * ```ts
 * terminalText("/pets\u001b[2J"); // → "/pets\\u001b[2J"
 * ```
 */
export function terminalText(text: string): string {
  let shown = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    shown += actedOn(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return shown;
}

function actedOn(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}
