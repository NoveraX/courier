interface SaveBarProps {
  count: number;
  onDiscard: () => void;
  onSave: () => void;
}

/**
 * The bar that floats at the foot of Settings while the draft has unsaved
 * changes: how many, Discard and Save changes — clear of a phone's home
 * indicator, and across the whole width a phone has.
 *
 * @param props - How many changes, and what discards and saves them
 * @returns The bar
 * @example
 * ```tsx
 * <SaveBar count={2} onDiscard={discard} onSave={save} />
 * ```
 */
export function SaveBar({ count, onDiscard, onSave }: SaveBarProps): React.ReactNode {
  return (
    <section
      aria-label="Unsaved changes"
      className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex justify-center"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-sheet border border-line-strong bg-panel py-2 pr-2 pl-3.5 shadow-overlay animate-pop-in max-sm:w-full max-sm:gap-2">
        <span className="text-control font-strong max-sm:min-w-0 max-sm:flex-1">{`${count} unsaved change${count === 1 ? "" : "s"}`}</span>
        <button
          type="button"
          onClick={onDiscard}
          className="h-7.5 shrink-0 cursor-pointer rounded-card border border-line px-3 text-control text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          className="h-7.5 shrink-0 cursor-pointer rounded-card bg-brand px-3.5 text-control font-semibold text-bg hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand pointer-coarse:h-9"
        >
          Save changes
        </button>
      </div>
    </section>
  );
}
