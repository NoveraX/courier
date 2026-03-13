import { Link } from "@tanstack/react-router";
import { TABS } from "../app-config";

import type { LucideIcon } from "lucide-react";

interface SidebarProps {
  themeIcon: LucideIcon;
  theme: string;
  onThemeToggle: () => void;
}

export function Sidebar({ themeIcon: ThemeIcon, theme, onThemeToggle }: SidebarProps) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center border-r border-border-default bg-surface-0 py-2">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
        <span className="text-sm font-bold text-indigo-400">N</span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-0.5">
        {TABS.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            preload="intent"
            activeOptions={{ exact: false }}
            className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
            activeProps={{ className: "!bg-surface-2 !text-text-primary" }}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded bg-surface-3 px-2 py-1 text-xs text-text-primary shadow-lg group-hover:block">
                  {label}
                </span>
              </>
            )}
          </Link>
        ))}
      </div>

      <button
        type="button"
        title={`Theme: ${theme}`}
        onClick={onThemeToggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
      >
        <ThemeIcon size={16} />
      </button>
    </nav>
  );
}
