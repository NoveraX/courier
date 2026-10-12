import { useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { Settings } from "@/store/types-ui";
import { SectionChips } from "./section-chips";
import { SECTION_GROUPS } from "./settings-sections";
import { scrollToSection, useSectionInView } from "./use-section-in-view";

/* Narrower than this, the page has no room for the list beside the sections (the CSS of
   settings-screen switches at the same width). */
const NARROW = "(max-width: 859px)";

function Title({ className }: { className?: string | undefined }): React.ReactNode {
  const writable = useStudioStore((s) => s.projectWritable);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">Settings</h1>
      <span className="text-small text-fg-subtle">
        {writable ? "Kept in the project" : "Kept in this browser"}
      </span>
    </div>
  );
}

/**
 * Settings' navigation: what the page is, and its sections by group — the
 * one in view lit, «unsaved» beside each with unsaved changes — each
 * scrolling its section into view. Beside the sections it is a list that
 * stays in place; on a window too narrow for that, the title heads the
 * page and the sections become a row of chips that stays at the top of the
 * view, so the first section is not pushed below the fold.
 *
 * @param props - The settings the draft changed
 * @returns The navigation
 * @example
 * ```tsx
 * <SettingsNav changed={draft.changed} />
 * ```
 */
export function SettingsNav({
  changed,
}: {
  changed: ReadonlySet<keyof Settings>;
}): React.ReactNode {
  const narrow = useMediaQuery(NARROW);
  const inView = useSectionInView(narrow);
  const still = useReducedMotion();
  if (narrow) {
    return (
      <>
        <Title />
        <SectionChips inView={inView} changed={changed} />
      </>
    );
  }
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-4 min-[860px]:sticky min-[860px]:top-6"
    >
      <Title className="px-2.5 pb-1" />
      {SECTION_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-px">
          <span className="px-2.5 pb-1.25 text-label font-medium text-fg-subtle">
            {group.label}
          </span>
          {group.sections.map((section) => {
            const on = inView === section.id;
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#settings-${section.id}`}
                aria-current={on ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(section.id, still);
                }}
                className={cn(
                  "flex h-8 items-center gap-2.25 rounded-control px-2.5 text-control hover:bg-raised hover:text-fg pointer-coarse:h-10",
                  on ? "bg-raised font-semibold text-fg" : "text-fg-muted",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-3.25", on && section.tone)} />
                {section.label}
                {section.keys.some((key) => changed.has(key)) && (
                  <>
                    <span
                      aria-hidden="true"
                      className="ml-auto font-mono text-micro font-normal text-warn"
                    >
                      unsaved
                    </span>
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                )}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
