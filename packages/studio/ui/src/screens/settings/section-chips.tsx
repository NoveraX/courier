import { Fragment, useEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { Settings } from "@/store/types-ui";
import { revealOffset } from "./reveal-offset";
import type { SectionEntry } from "./settings-sections";
import { SECTION_GROUPS } from "./settings-sections";
import { scrollToSection } from "./use-section-in-view";

interface SectionChipsProps {
  /** The section in view. */
  inView: string;
  /** The settings the draft changed. */
  changed: ReadonlySet<keyof Settings>;
}

function Chip({
  section,
  on,
  unsaved,
  still,
}: {
  section: SectionEntry;
  on: boolean;
  unsaved: boolean;
  still: boolean;
}): React.ReactNode {
  const Icon = section.icon;
  return (
    <a
      href={`#settings-${section.id}`}
      aria-current={on ? "location" : undefined}
      onClick={(e) => {
        e.preventDefault();
        scrollToSection(section.id, still);
      }}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.75 rounded-full border px-3 text-control whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand pointer-coarse:h-9",
        on
          ? "border-line-strong bg-raised font-semibold text-fg"
          : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
      )}
    >
      <Icon aria-hidden="true" className={cn("size-3.25", on && section.tone)} />
      {section.label}
      {unsaved && (
        <>
          <span aria-hidden="true" className="font-mono text-micro font-normal text-warn">
            unsaved
          </span>
          <span className="sr-only">(unsaved changes)</span>
        </>
      )}
    </a>
  );
}

/**
 * Settings' sections as a row of chips that stays at the top of the view
 * while the page scrolls under it — how a window too narrow for the side
 * list goes from section to section. The chip of the section in view is
 * lit and kept in sight as the row scrolls sideways; «unsaved» marks each
 * section with unsaved changes, and a thin rule parts the groups.
 *
 * @param props - The section in view, and the settings the draft changed
 * @returns The row
 * @example
 * ```tsx
 * <SectionChips inView="display" changed={draft.changed} />
 * ```
 */
export function SectionChips({ inView, changed }: SectionChipsProps): React.ReactNode {
  const rowRef = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>(`a[href="#settings-${inView}"]`);
    if (!row || !chip) return;
    const view = { scrollLeft: row.scrollLeft, width: row.clientWidth };
    const left = revealOffset(view, { left: chip.offsetLeft, width: chip.offsetWidth });
    if (left !== row.scrollLeft) row.scrollTo({ left, behavior: still ? "auto" : "smooth" });
  }, [inView, still]);
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-0 z-10 -mx-6 border-b border-line bg-bg px-6 py-2 max-sm:-mx-4 max-sm:px-4"
    >
      <div ref={rowRef} className="scroll-row relative items-center gap-1.5">
        {SECTION_GROUPS.map((group, place) => (
          <Fragment key={group.label}>
            {place > 0 && <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line" />}
            {group.sections.map((section) => (
              <Chip
                key={section.id}
                section={section}
                on={inView === section.id}
                unsaved={section.keys.some((key) => changed.has(key))}
                still={still}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </nav>
  );
}
