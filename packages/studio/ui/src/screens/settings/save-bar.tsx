interface SaveBarProps {
  count: number;
  onDiscard: () => void;
  onSave: () => void;
}

/**
 * The bar that floats at the foot of Settings while the draft has unsaved
 * changes: how many, Discard and Save changes.
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
      className="pointer-events-none sticky bottom-4 z-10 flex justify-center"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-sheet border border-line-strong bg-panel py-2 pr-2 pl-3.5 shadow-overlay animate-pop-in">
        <span aria-hidden="true" className="size-1.75 rounded-full bg-warn" />
        <span className="text-control font-strong">{`${count} unsaved change${count === 1 ? "" : "s"}`}</span>
        <button
          type="button"
          onClick={onDiscard}
          className="h-7.5 cursor-pointer rounded-card border border-line px-3 text-control text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          className="h-7.5 cursor-pointer rounded-card bg-brand px-3.5 text-control font-semibold text-bg hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Save changes
        </button>
      </div>
    </section>
  );
}
