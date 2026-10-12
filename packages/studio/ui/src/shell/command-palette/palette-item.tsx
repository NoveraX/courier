import { Command } from "cmdk";

import { cn } from "@/lib/utils";
import type { PaletteEntry } from "./palette-entries";

interface PaletteItemProps {
  entry: PaletteEntry;
  onRun: () => void;
}

/**
 * One line of the command palette: its icon, what it is, a word on where
 * or what, and the shortcut that runs it outside the palette — a shortcut
 * a touch screen has no keyboard for, so it goes there, and the line grows
 * to a finger's height.
 *
 * @param props - The entry, and what running it does
 * @returns The line
 * @example
 * ```tsx
 * <PaletteItem entry={entry} onRun={() => run(entry.action)} />
 * ```
 */
export function PaletteItem({ entry, onRun }: PaletteItemProps): React.ReactNode {
  const Icon = entry.icon;
  return (
    <Command.Item
      value={`${entry.label} ${entry.meta} ${entry.id}`}
      onSelect={onRun}
      className="group flex h-9 cursor-pointer items-center gap-3 rounded-control px-2.5 text-fg-muted data-[selected=true]:bg-raised data-[selected=true]:text-fg pointer-coarse:h-11"
    >
      <Icon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-fg-subtle group-data-[selected=true]:text-brand"
      />
      <span className={cn("text-item", entry.mono && "font-mono")}>{entry.label}</span>
      <span className="truncate text-small text-fg-subtle">{entry.meta}</span>
      <span className="flex-1" />
      {entry.hint && (
        <span className="font-mono text-meta text-fg-subtle pointer-coarse:hidden">
          {entry.hint}
        </span>
      )}
    </Command.Item>
  );
}
