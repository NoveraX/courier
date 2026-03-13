import {
  Trash2, Pause, Play, Search, Sun, Moon, Monitor,
} from "lucide-react";

import type { RequestEntry } from "../store";

import { ALL_NAV_ITEMS, SETTINGS_NAV } from "../app-config";
import {
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";

// ── Status dot (for recent requests) ────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "success"
      ? "bg-emerald-500"
      : status === "error" || status === "validation_error"
        ? "bg-red-500"
        : status === "pending"
          ? "bg-sky-500"
          : "bg-zinc-500";

  return <div className={`size-2 shrink-0 rounded-full ${color}`} />;
}

// ── Navigate ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [...ALL_NAV_ITEMS, SETTINGS_NAV];

export function NavigateGroup({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <CommandGroup heading="Navigate">
      {NAV_ITEMS.map(({ to, icon: Icon, label, shortcut }) => (
        <CommandItem key={to} value={`navigate ${to} ${label}`} onSelect={() => onNavigate(to)}>
          <Icon />
          <span>{label}</span>
          {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────

export function ActionsGroup({
  paused,
  onClear,
  onTogglePause,
  onShowFilters,
}: {
  paused: boolean;
  onClear: () => void;
  onTogglePause: () => void;
  onShowFilters: () => void;
}) {
  return (
    <CommandGroup heading="Actions">
      <CommandItem value="clear requests" onSelect={onClear}>
        <Trash2 />
        <span>Clear all requests</span>
        <CommandShortcut>⌘E</CommandShortcut>
      </CommandItem>
      <CommandItem value="pause resume recording" onSelect={onTogglePause}>
        {paused ? <Play /> : <Pause />}
        <span>{paused ? "Resume recording" : "Pause recording"}</span>
        <CommandShortcut>⌘P</CommandShortcut>
      </CommandItem>
      <CommandItem value="search filter requests" onSelect={onShowFilters}>
        <Search />
        <span>Search / filter requests</span>
        <CommandShortcut>⌘F</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  );
}

// ── Theme ───────────────────────────────────────────────────────────────────

export function ThemeGroup({ onSelect }: { onSelect: (theme: "dark" | "light" | "system") => void }) {
  return (
    <CommandGroup heading="Theme">
      <CommandItem value="theme dark" onSelect={() => onSelect("dark")}>
        <Moon />
        <span>Dark theme</span>
      </CommandItem>
      <CommandItem value="theme light" onSelect={() => onSelect("light")}>
        <Sun />
        <span>Light theme</span>
      </CommandItem>
      <CommandItem value="theme system auto" onSelect={() => onSelect("system")}>
        <Monitor />
        <span>System theme</span>
      </CommandItem>
    </CommandGroup>
  );
}

// ── Recent Requests ─────────────────────────────────────────────────────────

export function RecentRequestsGroup({
  requests,
  onSelect,
}: {
  requests: RequestEntry[];
  onSelect: (id: string) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <CommandGroup heading="Recent Requests">
      {requests.map((r) => (
        <CommandItem
          key={r.id}
          value={`request ${r.source} ${r.group} ${r.method} ${r.id}`}
          onSelect={() => onSelect(r.id)}
        >
          <StatusDot status={r.status} />
          <span className="font-mono text-xs">
            {r.source}.{r.group}.{r.method}
          </span>
          {r.statusCode && (
            <CommandShortcut>{r.statusCode}</CommandShortcut>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
