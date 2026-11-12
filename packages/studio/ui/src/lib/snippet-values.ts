/*
 * A value written into a snippet, as the place it goes reads it. A snippet
 * is copied into code of any kind — a module, a page's script, a
 * component's file, a shell — so a value keeps its meaning in each.
 */

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/* What JSON writes as it is, yet ends what holds the code: `</` ends a
   page's script, `<!--` changes how the page reads the rest of it, and the
   two separators end a `//` comment, and a string before ES2019. JSON has
   each only inside a string, where its escape reads the same. */
const ENDS_CODE = new RegExp(`</|<!--|[${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, "g");

/* What ends a `//` comment before its line does, or the script around it. */
const ENDS_COMMENT = new RegExp(`</|<!--|[\\n\\r${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, "g");

/* A string of JSON, and the colon after it when it is a key. */
const JSON_STRING = /("(?:[^"\\]|\\.)*")(:?)/g;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/* A word the shell reads as it is: nothing in it expands, splits or quotes. Not `=`:
   zsh puts a command's path in place of a word that starts with one, and with
   magic_equal_subst set, in place of what follows one inside a word. */
const PLAIN_WORD = /^[\w@%+:,./-]+$/;

/* `</` as `<\/`, `<!--` with its `<` escaped, a separator or a line end as its `\u` escape. */
function written(found: string): string {
  if (found === "</") return "<\\/";
  const code = (found === "<!--" ? "<" : found).charCodeAt(0);
  const unicode = `\\u${code.toString(16).padStart(4, "0")}`;
  return found === "<!--" ? `${unicode}!--` : unicode;
}

/**
 * A string as a JavaScript string literal that reads the same wherever the
 * code is put: in a module, in a page's script, on a line of its own.
 *
 * @param text - The string
 * @returns The literal
 * @example
 * ```ts
 * codeString('say "hi"'); // '"say \\"hi\\""'
 * ```
 */
export function codeString(text: string): string {
  return JSON.stringify(text).replace(ENDS_CODE, written);
}

/**
 * A value as JavaScript that makes what `JSON.parse` makes of its JSON: an
 * object literal reads a `__proto__` key as the object's prototype, so that
 * key is written in brackets, which keep it a key.
 *
 * @param value - The value, as JSON holds it
 * @param indent - The spaces each level is set in by, as `JSON.stringify` takes them
 * @param bareKeys - Whether a key JavaScript takes as it is goes without quotes
 * @returns The code; a value JSON cannot hold is written as its text
 * @example
 * ```ts
 * codeValue({ id: "u_1" }, 0, true); // '{id:"u_1"}'
 * ```
 */
export function codeValue(value: unknown, indent = 0, bareKeys = false): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(value, null, indent);
  } catch {
    return codeString(String(value));
  }
  if (json === undefined) return "undefined";
  return json.replace(JSON_STRING, (_found: string, token: string, colon: string) => {
    const literal = token.replace(ENDS_CODE, written);
    if (colon === "") return literal;
    const key = JSON.parse(token) as string;
    if (key === "__proto__") return `[${literal}]:`;
    return bareKeys && IDENTIFIER.test(key) ? `${key}:` : `${literal}:`;
  });
}

/**
 * A name as a property of what comes before it: after a dot where
 * JavaScript takes the name so, in brackets where it does not.
 *
 * @param name - The name
 * @returns The property
 * @example
 * ```ts
 * codeProperty("orders"); // ".orders"
 * codeProperty("get-user"); // '["get-user"]'
 * ```
 */
export function codeProperty(name: string): string {
  return IDENTIFIER.test(name) ? `.${name}` : `[${codeString(name)}]`;
}

/**
 * Text for a `//` comment: nothing in it ends the comment before its line
 * does, or the page's script the code is put in.
 *
 * @param text - The text
 * @returns The text, each such character escaped
 * @example
 * ```ts
 * codeComment("a\nb"); // "a\\u000ab"
 * ```
 */
export function codeComment(text: string): string {
  return text.replace(ENDS_COMMENT, written);
}

/** A string as it goes between single quotes in a shell command: each quote closed, escaped and opened again. */
export function shellEscape(text: string): string {
  return text.replace(/'/g, "'\\''");
}

/**
 * A string as one word of a shell command: as it is where nothing in it is
 * the shell's, between single quotes where something is.
 *
 * @param text - The string
 * @returns The word
 * @example
 * ```ts
 * shellWord("POST"); // "POST"
 * shellWord("a b"); // "'a b'"
 * ```
 */
export function shellWord(text: string): string {
  return PLAIN_WORD.test(text) ? text : `'${shellEscape(text)}'`;
}
