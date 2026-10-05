import type { CodeToken, CodeTone } from "./highlight-tokens"

const TONE_CLASS: Readonly<Record<CodeTone, string>> = {
  keyword: "text-code-keyword",
  function: "text-code-function",
  string: "text-code-string",
  type: "text-code-type",
  number: "text-code-number",
  comment: "text-code-comment",
  punctuation: "text-code-punctuation",
  plain: "text-code-plain",
}

/**
 * One line of highlighted code, its runs in the site's code colours.
 *
 * @param props - The line's runs
 * @returns The runs
 * @example
 * ```tsx
 * <TokenLine tokens={lines[0]} />
 * ```
 */
export function TokenLine({ tokens }: { tokens: readonly CodeToken[] }) {
  return tokens.map((token, at) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a line's runs are fixed and never reorder
    <span key={at} className={TONE_CLASS[token.tone]}>
      {token.text}
    </span>
  ))
}
