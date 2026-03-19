import { cn } from "@/lib/utils";

import { SECTION_CONFIG } from "./constants";

// ── Sidebar navigation ──────────────────────────────────────────────────────

interface SectionNavProps {
  activeSection: string;
}

export function SectionNav({
  activeSection,
}: SectionNavProps): React.ReactElement {
  function scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav className="hidden w-48 shrink-0 border-r border-border-subtle py-4 pl-4 pr-2 lg:block">
      <p className="text-caption text-muted-foreground mb-3">Settings</p>
      <ul className="space-y-0.5">
        {SECTION_CONFIG.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => scrollTo(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-body-sm transition-colors",
                activeSection === s.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                s.id === "danger" && activeSection === s.id && "text-destructive",
              )}
            >
              <s.icon className="size-3.5" />
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
