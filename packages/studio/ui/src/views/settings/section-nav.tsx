import { cn } from "@/lib/utils";

import { SECTION_NAV_GROUPS } from "./constants";

// ── Sidebar navigation ──────────────────────────────────────────────────────

interface SectionNavProps {
  activeSection: string;
}

export function SectionNav({ activeSection }: SectionNavProps): React.ReactElement {
  function scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav className="hidden w-44 shrink-0 border-r border-border-subtle lg:block">
      <div className="px-3 pt-4 pb-2">
        {SECTION_NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="mb-1 px-2 text-caption text-muted-foreground/60">{group.label}</p>
            <ul className="space-y-px">
              {group.items.map((s) => {
                const isActive = activeSection === s.id;
                const isDanger = s.id === "danger";
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-md px-2.5 h-7 text-xs transition-colors",
                        isActive
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                        isActive &&
                          "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-brand",
                        isDanger && isActive && "text-destructive before:bg-destructive",
                      )}
                    >
                      <s.icon className="size-3.5 shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
