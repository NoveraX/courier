import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  RadioTower,
} from "lucide-react";

import type { GroupKind, GroupRow as GroupRowModel } from "@/features/waterfall/waterfall-rows";
import { cn } from "@/lib/utils";

const ICON: Readonly<Record<GroupKind, { icon: LucideIcon; tone: string }>> = {
  streams: { icon: RadioTower, tone: "text-brand" },
  http: { icon: ArrowRightLeft, tone: "text-fg-muted" },
  source: { icon: Database, tone: "text-fg-subtle" },
  group: { icon: Folder, tone: "text-fg-subtle" },
};

interface GroupRowProps {
  row: GroupRowModel;
  width: number;
  onToggle: (key: string) => void;
}

/**
 * A group's header in the Waterfall: what it holds and how many, how many
 * went direct and through the proxy when both did, and its average — or,
 * for streams, how many are still live. Clicking it folds its rows.
 *
 * @param props - The header, the visible width and what folds it
 * @returns The header row
 * @example
 * ```tsx
 * <GroupRow row={row} width={960} onToggle={toggle} />
 * ```
 */
export function GroupRow({ row, width, onToggle }: GroupRowProps): React.ReactNode {
  const { icon: Icon, tone } = ICON[row.groupKind];
  const Caret = row.open ? ChevronDown : ChevronRight;
  const mono = row.groupKind === "source" || row.groupKind === "group";
  return (
    <button
      type="button"
      aria-expanded={row.open}
      onClick={() => onToggle(row.key)}
      className="relative z-2 flex h-8 w-full cursor-pointer border-b border-line text-left pointer-coarse:h-11"
    >
      <span
        style={{ width }}
        className="sticky left-0 flex items-center gap-2 overflow-hidden bg-bg-subtle pr-3 pl-4 transition-colors hover:bg-raised"
      >
        <Caret aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
        <Icon aria-hidden="true" className={cn("size-3 shrink-0", tone)} />
        <span className={cn("min-w-0 truncate text-control font-semibold", mono && "font-mono")}>
          {row.label}
        </span>
        <span className="inline-flex h-4 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-raised px-1.25 text-meta text-fg-subtle">
          {row.count}
        </span>
        {row.split && (
          <>
            <span className="flex h-4.5 shrink-0 items-center rounded-chip bg-raised px-1.5 text-meta whitespace-nowrap text-fg-muted">
              {row.split.direct} direct
            </span>
            <span className="flex h-4.5 shrink-0 items-center rounded-chip bg-syntax-type/12 px-1.5 text-meta whitespace-nowrap text-syntax-type">
              {row.split.proxy} proxy
            </span>
          </>
        )}
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-badge whitespace-nowrap text-fg-subtle">
          {row.aside}
        </span>
      </span>
    </button>
  );
}
