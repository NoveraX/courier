import type { ReactNode } from "react"

const INDENT = "  "

function scalar(value: unknown): ReactNode {
  if (value === null || typeof value === "boolean") {
    return <span className="text-code-keyword">{String(value)}</span>
  }
  if (typeof value === "number") return <span className="text-code-number">{value}</span>
  if (typeof value === "string")
    return <span className="text-code-string">{JSON.stringify(value)}</span>
  return <span className="text-code-comment">{String(value)}</span>
}

function lines(value: unknown, depth: number): ReactNode {
  const pad = INDENT.repeat(depth + 1)
  const close = INDENT.repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return (
      <>
        {"[\n"}
        {value.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a JSON value's place is its identity
          <span key={i}>
            {pad}
            {lines(item, depth + 1)}
            {i < value.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {`${close}]`}
      </>
    )
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
    if (entries.length === 0) return "{}"
    return (
      <>
        {"{\n"}
        {entries.map(([key, item], i) => (
          <span key={key}>
            {pad}
            <span className="text-code-plain">{JSON.stringify(key)}</span>: {lines(item, depth + 1)}
            {i < entries.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {`${close}}`}
      </>
    )
  }
  return scalar(value)
}

/**
 * A JSON value laid out two spaces an indent, in the site's code colours.
 *
 * @param props - The value
 * @returns The text, to go in a `<pre>`
 * @example
 * ```tsx
 * <pre><JsonView value={{ id: 1 }} /></pre>
 * ```
 */
export function JsonView({ value }: { value: unknown }) {
  return <span className="text-code-punctuation">{lines(value, 0)}</span>
}
