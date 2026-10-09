/** A part of a file that holds code, and where it starts in the file. */
export interface ScriptBlock {
  readonly code: string;
  /** Its first character's offset in the file */
  readonly offset: number;
  /** The file name its language is read from: `component.ts` */
  readonly fileName: string;
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LANG = /\blang\s*=\s*["']?(tsx?|jsx?)["']?/i;
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/;
const COMPONENT = /\.(vue|svelte|astro)$/i;

/**
 * The code a file holds: all of it for a script, and for a Vue, Svelte or
 * Astro component its `<script>` blocks — and an Astro component's
 * frontmatter — each with where it starts, so a call found in it is placed
 * in the file.
 *
 * @param fileName - The file's name, which says what it is
 * @param text - Its text
 * @returns Its code, block by block
 * @example
 * ```ts
 * scriptBlocks("Cart.vue", text)[0]?.fileName; // "Cart.ts", for `<script setup lang="ts">`
 * ```
 */
export function scriptBlocks(fileName: string, text: string): ScriptBlock[] {
  if (!COMPONENT.test(fileName)) return [{ code: text, offset: 0, fileName }];
  const blocks: ScriptBlock[] = [];
  const front = fileName.toLowerCase().endsWith(".astro") ? FRONTMATTER.exec(text) : null;
  if (front?.[1] !== undefined) {
    blocks.push({ code: front[1], offset: front[0].indexOf(front[1]), fileName: "frontmatter.ts" });
  }
  for (const match of text.matchAll(SCRIPT)) {
    const [whole, attributes = "", code = ""] = match;
    const lang = LANG.exec(attributes)?.[1]?.toLowerCase() ?? "ts";
    const offset = (match.index ?? 0) + whole.indexOf(">") + 1;
    blocks.push({ code, offset, fileName: `component.${lang}` });
  }
  return blocks;
}
