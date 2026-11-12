/** A command as a POSIX shell reads it, for what Studio's snippets write. */
export interface ShellReading {
  /** Each word, its quotes taken off */
  words: string[];
  /** What the shell reads outside quotes: the command's own syntax */
  bare: string;
  /** The command with each quoted part as `'…'`: its shape, whatever the values */
  shape: string;
}

/**
 * Read a command as a shell does, for the syntax Studio's snippets use:
 * single-quoted strings, a backslash before a character or a line end, and
 * plain text. Nothing is run.
 *
 * @param command - The command
 * @returns Its words, its bare text and its shape
 * @example
 * ```ts
 * shellRead("curl 'a'\\''b'").words; // ["curl", "a'b"]
 * ```
 */
export function shellRead(command: string): ShellReading {
  const words: string[] = [];
  let word: string | undefined;
  let bare = "";
  let shape = "";
  const quoted = (text: string) => {
    word = (word ?? "") + text;
    if (!shape.endsWith("'…'")) shape += "'…'";
  };
  let at = 0;
  while (at < command.length) {
    const char = command.charAt(at);
    if (char === "'") {
      const close = command.indexOf("'", at + 1);
      if (close < 0) throw new Error(`The quote at ${at} is never closed`);
      quoted(command.slice(at + 1, close));
      at = close + 1;
    } else if (char === "\\" && command.charAt(at + 1) === "\n") {
      shape += "\\\n";
      at += 2;
    } else if (char === "\\") {
      quoted(command.charAt(at + 1));
      at += 2;
    } else {
      if (/\s/.test(char)) {
        if (word !== undefined) words.push(word);
        word = undefined;
      } else {
        word = (word ?? "") + char;
      }
      bare += char;
      shape += char;
      at++;
    }
  }
  if (word !== undefined) words.push(word);
  return { words, bare, shape };
}
