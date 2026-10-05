/*
 * Reading the literal props a page writes on its JSX components —
 * `items={[{ label: "npm", code: "…" }]}`, `rows={[["a", { label: "b" }]]}` —
 * without evaluating the page: arrays, objects and string literals only,
 * brackets inside strings left alone.
 */

const QUOTES = new Set(['"', "'", "`"])
const CLOSING: Readonly<Record<string, string>> = { "[": "]", "{": "}" }

/* The index just past the string literal that opens at `from`. */
function pastString(text: string, from: number): number {
  const quote = text[from]
  let i = from + 1
  while (i < text.length && text[i] !== quote) i += text[i] === "\\" ? 2 : 1
  return i + 1
}

/* The bracketed group that opens at `from`, brackets included. */
function group(text: string, from: number): string {
  const stack: string[] = []
  let i = from
  while (i < text.length) {
    const char = text[i] ?? ""
    if (QUOTES.has(char)) {
      i = pastString(text, i)
      continue
    }
    const closing = CLOSING[char]
    if (closing) stack.push(closing)
    else if (char === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) return text.slice(from, i + 1)
    }
    i++
  }
  return text.slice(from)
}

/* Each top-level element of an array literal, as its source. */
function elements(array: string): string[] {
  const out: string[] = []
  let i = 1
  while (i < array.length - 1) {
    const char = array[i] ?? ""
    if (QUOTES.has(char)) {
      const end = pastString(array, i)
      out.push(array.slice(i, end))
      i = end
    } else if (CLOSING[char]) {
      const part = group(array, i)
      out.push(part)
      i += part.length
    } else i++
  }
  return out
}

/* A double-quoted literal reads as JSON does; the content's own literals use no other escapes. */
function stringValue(literal: string): string {
  if (!literal.startsWith('"')) return literal.slice(1, -1)
  const parsed: unknown = JSON.parse(literal)
  return typeof parsed === "string" ? parsed : ""
}

function propArray(source: string, prop: string): string | null {
  const start = source.indexOf(`${prop}={`)
  if (start < 0) return null
  const open = source.indexOf("[", start)
  return open < 0 ? null : group(source, open)
}

/**
 * The string a key holds in an object literal's source.
 *
 * @param object - The object literal's source
 * @param key - The key
 * @returns Its text, escapes read, or `undefined` when it holds no string
 * @example
 * ```ts
 * jsxText('{ label: "npm", code: "npm i" }', "code") // "npm i"
 * ```
 */
export function jsxText(object: string, key: string): string | undefined {
  const match = new RegExp(`\\b${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(object)
  return match?.[1] ? stringValue(match[1]) : undefined
}

/**
 * The object literals of an array prop: `items={[{…}, {…}]}`.
 *
 * @param source - The component's source
 * @param prop - The prop
 * @returns Each object's source
 * @example
 * ```ts
 * jsxObjects('<CodeGroup items={[{ label: "npm" }]} />', "items") // ['{ label: "npm" }']
 * ```
 */
export function jsxObjects(source: string, prop: string): string[] {
  const array = propArray(source, prop)
  return array ? elements(array).filter((part) => part.startsWith("{")) : []
}

function cellsOf(array: string): string[] {
  return elements(array).map((cell) =>
    cell.startsWith("{") ? (jsxText(cell, "label") ?? "") : stringValue(cell)
  )
}

/**
 * The cells of an array prop, each a string or an object with a label:
 * `headers={["Feature", { label: "Courier", highlight: true }]}`.
 *
 * @param source - The component's source
 * @param prop - The prop
 * @returns The cells' text
 * @example
 * ```ts
 * jsxCells('headers={["A", { label: "B" }]}', "headers") // ["A", "B"]
 * ```
 */
export function jsxCells(source: string, prop: string): string[] {
  const array = propArray(source, prop)
  return array ? cellsOf(array) : []
}

/**
 * The rows of an array-of-arrays prop: `rows={[["a", "b"], ["c", "d"]]}`.
 *
 * @param source - The component's source
 * @param prop - The prop
 * @returns Each row's cells
 * @example
 * ```ts
 * jsxRows('rows={[["a", "b"]]}', "rows") // [["a", "b"]]
 * ```
 */
export function jsxRows(source: string, prop: string): string[][] {
  const array = propArray(source, prop)
  return array
    ? elements(array)
        .filter((row) => row.startsWith("["))
        .map(cellsOf)
    : []
}
