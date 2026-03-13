import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Circle, Monitor, Moon, Sun, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDevToolsStore } from "@/store";
import { NAV_GROUPS } from "@/app-config";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

import type { Theme } from "@/store";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const THEME_META: Array<{ value: Theme; icon: React.ReactNode; label: string }> = [
  { value: "dark", icon: <Moon className="size-4" />, label: "Dark mode" },
  { value: "light", icon: <Sun className="size-4" />, label: "Light mode" },
  { value: "system", icon: <Monitor className="size-4" />, label: "System theme" },
];

const ITEM_CLASS = "mx-2 rounded-lg py-2.5";

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): React.ReactNode {
  const navigate = useNavigate();
  const theme = useDevToolsStore((s) => s.theme);
  const setTheme = useDevToolsStore((s) => s.setTheme);
  const paused = useDevToolsStore((s) => s.paused);
  const togglePaused = useDevToolsStore((s) => s.togglePaused);
  const clearRequests = useDevToolsStore((s) => s.clearRequests);

  const run = useCallback(
    (fn: () => void) => {
      fn();
      onOpenChange(false);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Command Palette</DialogTitle>
        <DialogDescription>Search for a command to run.</DialogDescription>
      </DialogHeader>
      <DialogContent
        className="gap-0 overflow-hidden rounded-xl border-border/50 p-0 shadow-lg sm:max-w-lg"
        showCloseButton={false}
      >
        <Command className="flex h-full w-full flex-col overflow-hidden bg-popover **:data-[slot=command-input-wrapper]:h-auto **:data-[slot=command-input-wrapper]:grow **:data-[slot=command-input-wrapper]:border-0 **:data-[slot=command-input-wrapper]:px-0">
          <div className="flex h-12 items-center gap-2 border-b border-border/50 px-4">
            <CommandInput className="h-10 text-[15px]" placeholder="What do you need?" />
            <button
              className="flex shrink-0 items-center"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <Kbd>Esc</Kbd>
            </button>
          </div>

          <CommandList className="max-h-[400px] py-2">
            <CommandEmpty>Nothing found.</CommandEmpty>

            {NAV_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.path}
                    className={ITEM_CLASS}
                    value={`go to ${item.label}`}
                    onSelect={() => run(() => navigate({ to: item.path }))}
                  >
                    <item.icon aria-hidden />
                    <span>
                      Go to&nbsp;<strong className="font-semibold">{item.label}</strong>
                    </span>
                    {item.kbd && (
                      <KbdGroup className="ml-auto">
                        <Kbd>{"\u2318"}</Kbd>
                        <Kbd>{item.kbd}</Kbd>
                      </KbdGroup>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            <CommandGroup heading="Recording">
              <CommandItem
                className={ITEM_CLASS}
                value={paused ? "resume recording" : "pause recording"}
                onSelect={() => run(togglePaused)}
              >
                <Circle
                  aria-hidden
                  className={cn(paused ? "text-warning-foreground" : "text-success")}
                />
                {paused ? "Resume recording" : "Pause recording"}
              </CommandItem>
              <CommandItem
                className={ITEM_CLASS}
                value="clear requests"
                onSelect={() => run(clearRequests)}
              >
                <Trash2 aria-hidden />
                Clear all requests
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Appearance">
              {THEME_META
                .filter((t) => t.value !== theme)
                .map((t) => (
                  <CommandItem
                    key={t.value}
                    className={ITEM_CLASS}
                    value={`theme ${t.label}`}
                    onSelect={() => run(() => setTheme(t.value))}
                  >
                    {t.icon}
                    {t.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
