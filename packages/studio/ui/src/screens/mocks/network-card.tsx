import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface NetworkCardProps {
  icon: LucideIcon;
  /** The icon's colour. */
  tone: string;
  title: string;
  /** A note after the title. */
  note?: string | undefined;
  /** Controls at the end of the header. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A card of the mock's Network tab: an icon, a title and a note, controls
 * at the header's end, and its content.
 *
 * @param props - Its icon and its colour, its title and note, its header controls, and its content
 * @returns The card
 * @example
 * ```tsx
 * <NetworkCard icon={Radar} tone="text-brand" title="Observed" note="last 60 responses">{body}</NetworkCard>
 * ```
 */
export function NetworkCard({
  icon: Icon,
  tone,
  title,
  note,
  aside,
  children,
}: NetworkCardProps): React.ReactNode {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col overflow-hidden rounded-sheet border border-line bg-panel"
    >
      <div className="flex h-12.5 shrink-0 items-center gap-2.5 border-b border-line px-4.5">
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", tone)} />
        <h2 className="text-ui font-semibold whitespace-nowrap">{title}</h2>
        {note && <span className="truncate text-label text-fg-subtle">{note}</span>}
        {aside && (
          <>
            <div className="flex-1" />
            {aside}
          </>
        )}
      </div>
      {children}
    </section>
  );
}
