import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Monitor, Moon, Pause, Sun, Trash2 } from "lucide-react";

import { useStudioStore } from "@/store";
import { useBackToLive } from "@/hooks/use-back-to-live";
import { useClearRequests } from "@/hooks/use-clear-requests";
import { NAV_GROUPS } from "@/app-config";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { KbdHint } from "@/components/shared/kbd-hint";

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
  const theme = useStudioStore((s) => s.theme);
  const setTheme = useStudioStore((s) => s.setTheme);
  const paused = useStudioStore((s) => s.paused);
  const togglePaused = useStudioStore((s) => s.togglePaused);
  const shownSession = useStudioStore((s) => s.shownSession);
  const backToLive = useBackToLive();
  const clearRequests = useClearRequests();

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
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandGroup heading="Recording">
          <CommandItem
            value={shownSession ? "back to live requests" : paused ? "resume recording" : "pause recording"}
            onSelect={() => run(shownSession ? backToLive : togglePaused)}
          >
            {paused ? (
              <>
                <Pause aria-hidden className="size-4 text-muted-foreground" />
                <span>{shownSession ? "Back to live requests" : "Resume recording"}</span>
                <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                  Paused
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="relative flex size-4 items-center justify-center">
                  <span className="absolute size-2.5 animate-ping rounded-full bg-emerald-500/40" />
                  <span className="relative size-2 rounded-full bg-emerald-500" />
                </span>
                <span>Pause recording</span>
                <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  Recording
                </span>
              </>
            )}
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
          <KbdHint keys="escape" className="ml-1" />
        </button>
      </div>
    </CommandDialog>
  );
}
