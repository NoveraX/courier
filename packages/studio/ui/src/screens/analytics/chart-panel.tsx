interface ChartPanelProps {
  title: string;
  /** A word after the title saying what is charted: `distribution`. */
  note?: string | undefined;
  /** What sits at the head's far end: a figure, a legend. */
  aside?: React.ReactNode;
  /** The chart's data in words, for assistive technology; the drawing is hidden from it. */
  summary: string;
  children: React.ReactNode;
}

/**
 * One of Analytics' charts in its panel: a title, a note and an aside on
 * one line — the aside on a line of its own when a phone has no room for
 * it — the drawing under them, and its data in words for a screen reader.
 *
 * @param props - The title, note, aside, summary and drawing
 * @returns The panel
 * @example
 * ```tsx
 * <ChartPanel title="Status" note="breakdown" summary="182 succeeded">{donut}</ChartPanel>
 * ```
 */
export function ChartPanel({
  title,
  note,
  aside,
  summary,
  children,
}: ChartPanelProps): React.ReactNode {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3.5 rounded-dialog border border-line bg-panel px-4.5 pt-4 pb-3.5"
    >
      <div className="flex min-w-0 items-baseline gap-2.5 max-sm:flex-wrap max-sm:gap-y-1">
        <h2 className="m-0 text-ui font-semibold">{title}</h2>
        {note && <span className="text-label text-fg-subtle">{note}</span>}
        <div className="flex-1" />
        {aside}
      </div>
      <p className="sr-only">{summary}</p>
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
        {children}
      </div>
    </section>
  );
}
