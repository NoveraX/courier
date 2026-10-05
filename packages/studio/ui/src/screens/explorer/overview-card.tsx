import { cn } from "@/lib/utils";

interface OverviewCardProps {
  title: string;
  /** What follows the title: a note, a count, or controls pushed to the end. */
  aside?: React.ReactNode;
  className?: string | undefined;
  children: React.ReactNode;
}

/**
 * One of the Overview's cards: a titled panel.
 *
 * @param props - Its title, what follows it, and its content
 * @returns The card
 * @example
 * ```tsx
 * <OverviewCard title="Activity" aside={<LiveMark />}>{rows}</OverviewCard>
 * ```
 */
export function OverviewCard({
  title,
  aside,
  className,
  children,
}: OverviewCardProps): React.ReactNode {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-dialog border border-line bg-panel",
        className,
      )}
    >
      <div className="flex h-11.5 shrink-0 items-center gap-2 border-b border-line pr-2.5 pl-4">
        <h2 className="text-ui font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
