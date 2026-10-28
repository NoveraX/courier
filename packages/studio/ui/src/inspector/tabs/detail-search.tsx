import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface DetailSearchProps {
  /** What the field asks for: `Find in the answer`. */
  label: string;
  query: string;
  onQuery: (query: string) => void;
  /** How many matches there are, and which one is current, from 0. */
  found: { count: number; current: number } | undefined;
  /** Moves to the next match, or the previous one. */
  onStep: (step: 1 | -1) => void;
  /** The field itself, for a shortcut that brings it to hand. */
  fieldRef?: React.Ref<HTMLInputElement> | undefined;
}

/**
 * A search over a request's details: the text sought, how many places
 * match and which one is shown, and a way to the next and the previous —
 * Enter and Shift+Enter, as a browser's find does; Escape clears it.
 *
 * @param props - What it searches, the text, what it found, and what moves through it
 * @returns The bar
 * @example
 * ```tsx
 * <DetailSearch label="Find in the answer" query={q} onQuery={setQ} found={{ count: 3, current: 0 }} onStep={step} />
 * ```
 */
export function DetailSearch({
  label,
  query,
  onQuery,
  found,
  onStep,
  fieldRef,
}: DetailSearchProps): React.ReactNode {
  const button =
    "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-fg-subtle transition-colors hover:bg-raised hover:text-fg disabled:cursor-default disabled:opacity-40 pointer-coarse:size-9";
  const none = !found || found.count === 0;
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-card border border-line bg-inset pr-1 pl-2.5 pointer-coarse:h-10">
      <Search aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
      <input
        ref={fieldRef}
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape" && query !== "") {
            event.stopPropagation();
            onQuery("");
          }
        }}
        placeholder={`${label}: keys and values…`}
        aria-label={label}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {found && (
        <span aria-live="polite" className="shrink-0 text-label text-fg-subtle tabular-nums">
          {found.count === 0 ? "No matches" : `${found.current + 1} / ${found.count}`}
        </span>
      )}
      <button
        type="button"
        aria-label="Previous match"
        disabled={none}
        onClick={() => onStep(-1)}
        className={button}
      >
        <ChevronUp aria-hidden="true" className="size-3.25" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        disabled={none}
        onClick={() => onStep(1)}
        className={button}
      >
        <ChevronDown aria-hidden="true" className="size-3.25" />
      </button>
      {query !== "" && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => onQuery("")}
          className={button}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  );
}
