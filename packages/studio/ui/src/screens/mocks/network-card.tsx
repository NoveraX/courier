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
 * at the header's end, and its content. A card too narrow for its title and
 * controls side by side puts the controls on a line of their own, where
 * they scroll sideways if they are wider still.
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
      <div className="flex min-h-12.5 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line px-4.5 py-2">
        <div className="flex min-w-0 flex-auto items-center gap-2.5">
          <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", tone)} />
          <h2 className="text-ui font-semibold whitespace-nowrap">{title}</h2>
          {note && <span className="truncate text-label text-fg-subtle">{note}</span>}
        </div>
        {aside && <div className="scroll-row max-w-full min-w-0 items-center gap-2.5">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
