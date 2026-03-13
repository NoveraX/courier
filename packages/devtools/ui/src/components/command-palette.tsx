import { useState, useMemo, useEffect } from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useDevToolsStore } from "../store";
import { NavigateGroup, ActionsGroup, ThemeGroup, RecentRequestsGroup } from "./command-groups";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const store = useDevToolsStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const recentRequests = useMemo(
    () => store.requests.slice(-20).reverse(),
    [store.requests],
  );

  function close() {
    onOpenChange(false);
  }

  function navigateTo(path: string) {
    void navigate({ to: path });
    close();
  }

  function selectRequest(id: string) {
    void navigate({ to: "/timeline", search: { request: id } });
    close();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      <Command
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border-default bg-surface-1 shadow-2xl"
        shouldFilter={true}
        loop
      >
        <div className="flex items-center border-b border-border-default px-3">
          <Search size={16} className="shrink-0 text-text-muted" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command or search…"
            className="h-11 w-full bg-transparent px-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="shrink-0 rounded border border-border-default bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-72 overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
            No results found.
          </Command.Empty>

          <NavigateGroup onNavigate={navigateTo} />

          <ActionsGroup
            paused={store.paused}
            onClear={() => { store.clearRequests(); close(); }}
            onTogglePause={() => { store.togglePaused(); close(); }}
            onShowFilters={() => {
              void navigate({ to: "/timeline" });
              store.setTimelineShowFilters(true);
              close();
            }}
          />

          <ThemeGroup onSelect={(t) => { store.setTheme(t); close(); }} />

          <RecentRequestsGroup requests={recentRequests} onSelect={selectRequest} />
        </Command.List>
      </Command>
    </div>
  );
}
