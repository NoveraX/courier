import { Command, useCommandState } from "cmdk";
import { Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { focusOnClose } from "@/design/focus-on-close";
import { DIALOG_MOTION, SCRIM_MOTION } from "@/design/overlay-motion";
import { Shortcut } from "@/design/shortcut";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { paletteEntries } from "./palette-entries";
import { PaletteItem } from "./palette-item";
import { useRunAction } from "./use-run-action";

const GROUPS = ["Recent requests", "Go to", "Actions"] as const;

/* Below `sm` the palette takes the whole screen, clear of a phone's notch and home indicator. */
const FULL_SCREEN =
  "max-sm:inset-0 max-sm:flex max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:flex-col max-sm:rounded-none";

/* On a window too short for the whole list — a phone held sideways — it stops a margin above
   the window's foot: below the palette's top, less its input and footer (88px). */
const LIST_HEIGHT = "max-h-[min(420px,calc(87dvh-96px))] max-sm:max-h-none";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
 * The command palette: the latest calls, every view, Settings, the
 * documentation, and Studio's actions, filtered as one types and run from
 * the keyboard. On a phone it takes the whole screen, with a button to
 * close it; on a touch screen it leaves out the keys a finger has no use
 * for.
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
  const recording = useStudioStore((s) =>
    s.shownSession ? "session" : s.paused ? "paused" : "recording",
  );
  const run = useRunAction();
  const exportFormat = useStudioStore((s) => s.settings.defaultExportFormat);
  const entries = paletteEntries(requests, recording, exportFormat);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn("fixed inset-0 z-50 bg-black/42 backdrop-blur-[3px]", SCRIM_MOTION)}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={focusOnClose}
          className={cn(
            "fixed top-[13dvh] left-1/2 z-50 w-150 max-w-[calc(100vw-40px)] -translate-x-1/2 overflow-hidden rounded-dialog bg-panel shadow-overlay",
            FULL_SCREEN,
            DIALOG_MOTION,
          )}
        >
          <Dialog.Title className="sr-only">Search Studio</Dialog.Title>
          <Command
            loop
            label="Search Studio"
            className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col"
          >
            <div className="flex h-13 items-center gap-3 border-b border-line px-4 max-sm:h-[calc(52px+env(safe-area-inset-top))] max-sm:shrink-0 max-sm:pt-[env(safe-area-inset-top)]">
              <Search aria-hidden="true" className="size-3.75 shrink-0 text-fg-subtle" />
              <Command.Input
                placeholder="Search views, requests and actions…"
                enterKeyHint="go"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-prompt tracking-[-0.01em] text-fg outline-none placeholder:text-fg-subtle"
              />
              <Shortcut keys={["escape"]} className="pointer-coarse:hidden max-sm:hidden" />
              <Dialog.Close
                aria-label="Close the search"
                className="-mr-2 hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:flex max-sm:flex"
              >
                <X aria-hidden="true" className="size-4" />
              </Dialog.Close>
            </div>
            <Command.List
              className={cn(
                "relative overflow-auto overscroll-contain p-1.5 max-sm:min-h-0 max-sm:flex-1",
                LIST_HEIGHT,
              )}
            >
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
                      <PaletteItem
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
            <div className="flex h-9 items-center gap-4 border-t border-line bg-panel-subtle px-4 font-mono text-meta text-fg-subtle max-sm:h-[calc(36px+env(safe-area-inset-bottom))] max-sm:shrink-0 max-sm:pb-[env(safe-area-inset-bottom)]">
              <span className="flex items-center gap-1.5 pointer-coarse:hidden">
                <Shortcut keys={["up"]} />
                <Shortcut keys={["down"]} />
                navigate
              </span>
              <span className="flex items-center gap-1.5 pointer-coarse:hidden">
                <Shortcut keys={["enter"]} />
                open
              </span>
              <span className="flex-1" />
              <ResultCount />
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
