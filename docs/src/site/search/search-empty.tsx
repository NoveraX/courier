const ISSUES = "https://github.com/NoveraX/courier/issues/new"

/**
 * What search says when nothing matches: that nothing did, and where to
 * tell the project what the reader was looking for.
 *
 * @param props - What was typed
 * @returns The message
 * @example
 * ```tsx
 * <SearchEmpty query="graphql" />
 * ```
 */
export function SearchEmpty({ query }: { query: string }) {
  const issue = `${ISSUES}?${new URLSearchParams({ title: `Docs: nothing found for “${query}”` })}`
  return (
    <div className="px-4 py-10 text-center">
      <p className="m-0 text-control text-fg-muted">Nothing matches “{query}”</p>
      <p className="m-0 mt-1.5 text-small text-fg-subtle">
        Try other words, or{" "}
        <a
          href={issue}
          target="_blank"
          rel="noopener noreferrer"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          tell us what you were looking for
        </a>
      </p>
    </div>
  )
}
