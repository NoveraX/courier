import { Command } from "cmdk";
import {
  Activity, GitBranch, Layers, BarChart3, Network, Play,
  ShieldCheck, ChevronsLeftRightEllipsis, GitCompare, Settings,
  Trash2, Pause, Sun, Moon, Monitor, Search,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { RequestEntry } from "../store";

// ── Constants ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { to: string; icon: LucideIcon; label: string; shortcut?: string[] }[] = [
  { to: "/timeline", icon: Activity, label: "Timeline", shortcut: ["1"] },
  { to: "/waterfall", icon: GitBranch, label: "Waterfall", shortcut: ["2"] },
  { to: "/middleware", icon: Layers, label: "Middleware" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/explorer", icon: Network, label: "API Explorer" },
  { to: "/playground", icon: Play, label: "Playground", shortcut: ["6"] },
  { to: "/audit", icon: ShieldCheck, label: "Audit" },
  { to: "/apis", icon: ChevronsLeftRightEllipsis, label: "APIs" },
  { to: "/compare", icon: GitCompare, label: "Compare" },
  { to: "/settings", icon: Settings, label: "Settings", shortcut: ["⌘", ","] },
];

// ── Shared Helpers ───────────────────────────────────────────────────────────

export function Shortcut({ keys }: { keys: string[] }) {
  return (
    <span className="ml-auto flex items-center gap-0.5">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-border-default bg-surface-2 px-1 py-0.5 text-[10px] text-text-muted"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "success"
      ? "bg-emerald-500"
      : status === "error" || status === "validation_error"
        ? "bg-red-500"
        : status === "pending"
          ? "bg-sky-500"
          : "bg-zinc-500";

  return <div className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

// ── Navigate Group ───────────────────────────────────────────────────────────

export function NavigateGroup({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <Command.Group heading="Navigate" className="command-group">
      {NAV_ITEMS.map(({ to, icon: Icon, label, shortcut }) => (
        <Command.Item
          key={to}
          value={`navigate ${to} ${label}`}
          onSelect={() => onNavigate(to)}
          className="command-item"
        >
          <Icon size={14} className="shrink-0 text-text-muted" />
          <span>{label}</span>
          {shortcut && <Shortcut keys={shortcut} />}
        </Command.Item>
      ))}
    </Command.Group>
  );
}

// ── Actions Group ────────────────────────────────────────────────────────────

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
    <Command.Group heading="Actions" className="command-group">
      <Command.Item value="clear requests" onSelect={onClear} className="command-item">
        <Trash2 size={14} className="shrink-0 text-text-muted" />
        <span>Clear all requests</span>
        <Shortcut keys={["⌘", "E"]} />
      </Command.Item>
      <Command.Item value="pause resume recording" onSelect={onTogglePause} className="command-item">
        <Pause size={14} className="shrink-0 text-text-muted" />
        <span>{paused ? "Resume recording" : "Pause recording"}</span>
        <Shortcut keys={["⌘", "P"]} />
      </Command.Item>
      <Command.Item value="search filter requests" onSelect={onShowFilters} className="command-item">
        <Search size={14} className="shrink-0 text-text-muted" />
        <span>Search / filter requests</span>
        <Shortcut keys={["⌘", "F"]} />
      </Command.Item>
    </Command.Group>
  );
}

// ── Theme Group ──────────────────────────────────────────────────────────────

export function ThemeGroup({ onSelect }: { onSelect: (theme: "dark" | "light" | "system") => void }) {
  return (
    <Command.Group heading="Theme" className="command-group">
      <Command.Item value="theme dark" onSelect={() => onSelect("dark")} className="command-item">
        <Moon size={14} className="shrink-0 text-text-muted" />
        <span>Dark theme</span>
      </Command.Item>
      <Command.Item value="theme light" onSelect={() => onSelect("light")} className="command-item">
        <Sun size={14} className="shrink-0 text-text-muted" />
        <span>Light theme</span>
      </Command.Item>
      <Command.Item value="theme system auto" onSelect={() => onSelect("system")} className="command-item">
        <Monitor size={14} className="shrink-0 text-text-muted" />
        <span>System theme</span>
      </Command.Item>
    </Command.Group>
  );
}

// ── Recent Requests Group ────────────────────────────────────────────────────

export function RecentRequestsGroup({
  requests,
  onSelect,
}: {
  requests: RequestEntry[];
  onSelect: (id: string) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <Command.Group heading="Recent Requests" className="command-group">
      {requests.map((r) => (
        <Command.Item
          key={r.id}
          value={`request ${r.source} ${r.group} ${r.method} ${r.id}`}
          onSelect={() => onSelect(r.id)}
          className="command-item"
        >
          <StatusDot status={r.status} />
          <span className="font-mono text-xs">
            {r.source}.{r.group}.{r.method}
          </span>
          {r.statusCode && (
            <span className="ml-auto text-xs text-text-muted">{r.statusCode}</span>
          )}
        </Command.Item>
      ))}
    </Command.Group>
  );
}
