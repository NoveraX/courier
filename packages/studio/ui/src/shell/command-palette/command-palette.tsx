import { Command, useCommandState } from "cmdk";
import { Search } from "lucide-react";
import { Dialog } from "radix-ui";

import { Kbd } from "@/design/kbd";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { PaletteEntry } from "./palette-entries";
import { paletteEntries } from "./palette-entries";
import { useRunAction } from "./use-run-action";

const GROUPS = ["Recent requests", "Go to", "Actions"] as const;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Entry({ entry, onRun }: { entry: PaletteEntry; onRun: () => void }): React.ReactNode {
  const Icon = entry.icon;
  return (
    <Command.Item
      value={`${entry.label} ${entry.meta} ${entry.id}`}
      onSelect={onRun}
      className="group flex h-9 cursor-pointer items-center gap-3 rounded-control px-2.5 text-fg-muted data-[selected=true]:bg-raised data-[selected=true]:text-fg"
    >
      <Icon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-fg-subtle group-data-[selected=true]:text-brand"
      />
      <span className={cn("text-item", entry.mono && "font-mono")}>{entry.label}</span>
      <span className="truncate text-small text-fg-subtle">{entry.meta}</span>
      <span className="flex-1" />
      {entry.hint && <span className="font-mono text-meta text-fg-subtle">{entry.hint}</span>}
    </Command.Item>
  );
}

/* The footer's count follows the filter as it narrows. */
function ResultCount(): React.ReactNode {
  const count = useCommandState((state) => state.filtered.count);
  return <span>{count === 1 ? "1 result" : `${count} results`}</span>;
}

/* The empty state names what was searched for. */
function NoMatches(): React.ReactNode {
  const query = useCommandState((state) => state.search);
  return <>No matches for “{query}”</>;
}

/**
 * The command palette: the latest calls, every view, and Studio's actions,
 * filtered as one types and run from the keyboard.
 *
 * @param props - Whether it is open, and what closes it
 * @returns The palette
 * @example
 * ```tsx
 * <CommandPalette open={open} onOpenChange={setOpen} />
 * ```
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const paused = useStudioStore((s) => s.paused);
  const run = useRunAction();
  const exportFormat = useStudioStore((s) => s.settings.defaultExportFormat);
  const entries = paletteEntries(requests, paused, exportFormat);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/42 backdrop-blur-[3px]" />
        <Dialog.Content
          data-shell=""
          aria-describedby={undefined}
          className="fixed top-[13vh] left-1/2 z-50 w-150 max-w-[calc(100vw-40px)] -translate-x-1/2 animate-pop-in overflow-hidden rounded-dialog bg-panel shadow-overlay"
        >
          <Dialog.Title className="sr-only">Search Studio</Dialog.Title>
          <Command loop label="Search Studio">
            <div className="flex h-13 items-center gap-3 border-b border-line px-4">
              <Search aria-hidden="true" className="size-3.75 shrink-0 text-fg-subtle" />
              <Command.Input
                placeholder="Search views, requests and actions…"
                className="h-full min-w-0 flex-1 bg-transparent text-prompt tracking-[-0.01em] text-fg outline-none placeholder:text-fg-subtle"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-105 overflow-auto p-1.5">
              <Command.Empty className="px-2.5 py-7 text-center text-fg-subtle">
                <NoMatches />
              </Command.Empty>
              {GROUPS.map((group) => ({ group, members: entries.filter((e) => e.group === group) }))
                .filter(({ members }) => members.length > 0)
                .map(({ group, members }) => (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="pb-1 **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-2.5 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-label **:[[cmdk-group-heading]]:font-strong **:[[cmdk-group-heading]]:text-fg-subtle"
                  >
                    {members.map((entry) => (
                      <Entry
                        key={entry.id}
                        entry={entry}
                        onRun={() => {
                          onOpenChange(false);
                          run(entry.action);
                        }}
                      />
                    ))}
                  </Command.Group>
                ))}
            </Command.List>
            <div className="flex h-9 items-center gap-4 border-t border-line bg-panel-subtle px-4 font-mono text-meta text-fg-subtle">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span className="flex-1" />
              <ResultCount />
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
