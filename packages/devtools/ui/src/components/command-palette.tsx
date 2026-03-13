import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useDevToolsStore } from "../store";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import {
  NavigateGroup,
  ActionsGroup,
  ThemeGroup,
  RecentRequestsGroup,
} from "./command-groups";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const store = useDevToolsStore();
  const navigate = useNavigate();

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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <CommandInput placeholder="Type a command or search\u2026" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <NavigateGroup onNavigate={navigateTo} />

        <ActionsGroup
          paused={store.paused}
          onClear={() => { store.clearRequests(); close(); }}
          onTogglePause={() => { store.togglePaused(); close(); }}
          onShowFilters={() => {
            void navigate({ to: "/timeline", search: { filters: true } });
            close();
          }}
        />

        <ThemeGroup onSelect={(t) => { store.setTheme(t); close(); }} />

        <RecentRequestsGroup requests={recentRequests} onSelect={selectRequest} />
      </CommandList>
    </CommandDialog>
  );
}
