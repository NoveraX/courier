import { SITE_URL } from "@/site/site-url"
import { AlgoliaLogo } from "./algolia-logo"
import { algoliaReferral } from "./docsearch-config"

const KEY = "rounded-[4px] border border-line px-1.25 py-px font-mono text-micro text-fg-muted"

const REFERRAL = algoliaReferral(new URL(SITE_URL).hostname)

function Hint({ keys, label }: { keys: readonly string[]; label: string }) {
  return (
    <span className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap min-[640px]:flex">
      {keys.map((key) => (
        <kbd key={key} className={KEY}>
          {key}
        </kbd>
      ))}
      {label}
    </span>
  )
}

interface SearchFooterProps {
  /** The index could not be reached: the results match page titles alone. */
  titlesOnly: boolean
  /** Clears the recent results — offered while they are listed. */
  onClearRecent?: (() => void) | undefined
}

/**
 * The foot of search: the keys that move through it — or, when the docs'
 * index cannot be reached, that the results match page titles alone — and
 * Algolia's mark, which the DocSearch program asks every search it powers
 * to carry.
 *
 * @param props - Whether the results match titles alone, and what clears the recent ones
 * @returns The foot
 * @example
 * ```tsx
 * <SearchFooter titlesOnly={false} onClearRecent={recent.clear} />
 * ```
 */
export function SearchFooter({ titlesOnly, onClearRecent }: SearchFooterProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-t border-line px-3.5 text-meta text-fg-subtle">
      {titlesOnly ? (
        <span role="status" className="min-w-0 truncate">
          Search is offline — matching page titles only
        </span>
      ) : (
        <>
          <Hint keys={["↑", "↓"]} label="to move" />
          <Hint keys={["↵"]} label="to open" />
          <Hint keys={["esc"]} label="to close" />
        </>
      )}
      {onClearRecent && (
        <button
          type="button"
          onClick={onClearRecent}
          className="-mx-1.5 shrink-0 cursor-pointer whitespace-nowrap rounded-[6px] px-1.5 py-1 transition-colors hover:text-fg"
        >
          Clear recent
        </button>
      )}
      <a
        href={REFERRAL}
        target="_blank"
        rel="noopener noreferrer"
        className="-mr-1 ml-auto flex shrink-0 items-center gap-1.5 rounded-[6px] px-1 py-1 transition-colors hover:text-fg-muted"
      >
        Search by
        <AlgoliaLogo className="h-3.25 w-auto" />
      </a>
    </div>
  )
}
