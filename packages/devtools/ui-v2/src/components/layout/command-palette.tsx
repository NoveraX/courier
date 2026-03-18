import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Circle, Monitor, Moon, Sun, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDevToolsStore } from "@/store";
import { NAV_GROUPS } from "@/app-config";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";

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
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <CommandInput className="h-12" placeholder="What do you need?" />

      <CommandList className="max-h-100">
        <CommandEmpty>Nothing found.</CommandEmpty>

        {NAV_GROUPS.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.path}
                value={`go to ${item.label}`}
                onSelect={() => run(() => navigate({ to: item.path }))}
              >
                <item.icon aria-hidden />
                <span>
                  Go to&nbsp;<strong className="font-semibold">{item.label}</strong>
                </span>
                {item.kbd && (
                  <Kbd className="ml-auto">{"\u2318"}{item.kbd}</Kbd>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandGroup heading="Recording">
          <CommandItem
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
                value={`theme ${t.label}`}
                onSelect={() => run(() => setTheme(t.value))}
              >
                {t.icon}
                {t.label}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>

      <div className="flex h-12 items-center justify-end border-t px-3">
        <button
          className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          <span>Close</span>
          <Kbd className="ml-1">Esc</Kbd>
        </button>
      </div>
    </CommandDialog>
  );
}
