/** A `<script>` block of a component's file, as HTML reads it. */
export interface ScriptTag {
  /** Its start tag's attributes, by their names in lower case: the first of each name, `""` where it has no value. */
  readonly attributes: ReadonlyMap<string, string>;
  /** Its text, between its start tag and its end tag. */
  readonly text: string;
  /** Where its text starts in the file. */
  readonly offset: number;
}

/* The characters HTML reads as white space in a tag. */
const SPACE = new Set(["\t", "\n", "\f", "\r", " "]);

/* Whether a tag's name ends before this character: at white space, `/`, `>` or the end of the text. */
function endsName(char: string | undefined): boolean {
  return char === undefined || SPACE.has(char) || char === "/" || char === ">";
}

/* Whether a tag's name at `at` is `script`, in any case, and no longer: `<script-notes>` is no script. */
function isScript(text: string, at: number): boolean {
  return text.slice(at, at + 6).toLowerCase() === "script" && endsName(text[at + 6]);
}

/* An attribute's value at `at`, past its `=`, and the index past it: in quotes, up to the closing
   one, a `>` and all; else up to white space or a `>`. None where its quote is not closed. */
function valueAt(
  text: string,
  at: number,
): { readonly value: string; readonly end: number } | undefined {
  const quote = text[at];
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, at + 1);
    return close === -1 ? undefined : { value: text.slice(at + 1, close), end: close + 1 };
  }
  let end = at;
  while (end < text.length && !SPACE.has(text[end] ?? "") && text[end] !== ">") end += 1;
  return { value: text.slice(at, end), end };
}

/* The index past the `>` of a tag whose attributes start at `at`, each read into `attributes` as
   HTML reads it, or -1 where a quote or the tag runs on to the end of the text. */
function tagEnd(text: string, at: number, attributes: Map<string, string>): number {
  let index = at;
  while (index < text.length) {
    if (text[index] === ">") return index + 1;
    if (SPACE.has(text[index] ?? "") || text[index] === "/") {
      index += 1;
      continue;
    }
    const name = index;
    index += 1;
    while (!endsName(text[index]) && text[index] !== "=") index += 1;
    const key = text.slice(name, index).toLowerCase();
    while (SPACE.has(text[index] ?? "")) index += 1;
    let value = "";
    if (text[index] === "=") {
      index += 1;
      while (SPACE.has(text[index] ?? "")) index += 1;
      const read = valueAt(text, index);
      if (read === undefined) return -1;
      value = read.value;
      index = read.end;
    }
    if (!attributes.has(key)) attributes.set(key, value);
  }
  return -1;
}

/* The first end tag of a script past `at`, where it starts and the index past its `>`: HTML ends
   the block there, with white space, attributes or a `/` before that `>` as with none. */
function endTag(
  text: string,
  at: number,
): { readonly start: number; readonly end: number } | undefined {
  for (let start = text.indexOf("</", at); start !== -1; start = text.indexOf("</", start + 2)) {
    if (!isScript(text, start + 2)) continue;
    const end = tagEnd(text, start + 8, new Map());
    return end === -1 ? undefined : { start, end };
  }
  return undefined;
}

/**
 * The `<script>` blocks of a component's file, as HTML reads them: a
 * start tag's attributes read whole, a `>` in a value in quotes and all;
 * each block ended by the first end tag of its name, white space,
 * attributes or a `/` before that tag's `>` as with none; and no block in
 * a comment, or in a tag whose name only starts with `script`. A block
 * whose start tag or end tag the text does not close is none, nor is
 * anything after it, which HTML reads as part of it.
 *
 * @param text - The file's text
 * @param from - Where its markup starts: past an Astro file's frontmatter, which is code
 * @returns The blocks, in the file's order
 * @example
 * ```ts
 * scriptTags('<script setup generic="T extends Record<K, V>" lang="ts">…</script >')[0]?.attributes.get("lang"); // "ts"
 * ```
 */
export function scriptTags(text: string, from = 0): ScriptTag[] {
  const tags: ScriptTag[] = [];
  for (let open = text.indexOf("<", from); open !== -1; ) {
    let next = open + 1;
    if (text.startsWith("<!--", open)) {
      /* Looked for from its first dash: HTML ends `<!-->` and `<!--->` where they start. */
      const close = text.indexOf("-->", open + 2);
      if (close === -1) break;
      next = close + 3;
    } else if (isScript(text, open + 1)) {
      const attributes = new Map<string, string>();
      const offset = tagEnd(text, open + 7, attributes);
      const close = offset === -1 ? undefined : endTag(text, offset);
      if (close === undefined) break;
      tags.push({ attributes, text: text.slice(offset, close.start), offset });
      next = close.end;
    }
    open = text.indexOf("<", next);
  }
  return tags;
}
