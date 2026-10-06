import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { Settings } from "@/store/types-ui";
import { SECTION_GROUPS } from "./settings-sections";

const IDS = SECTION_GROUPS.flatMap((group) => group.sections.map((s) => s.id));

/* The section nearest the top of the view is the one in view; the observer reports as they cross it. */
function useSectionInView(): string {
  const [inView, setInView] = useState(IDS[0] ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setInView(top.target.id.replace(/^settings-/, ""));
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const id of IDS) {
      const section = document.getElementById(`settings-${id}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  return inView;
}

/**
 * Settings' navigation: what the page is, and its sections by group — the
 * one in view lit, «unsaved» beside each with unsaved changes — each scrolling
 * its section into view.
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
  const inView = useSectionInView();
  const writable = useStudioStore((s) => s.projectWritable);
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-4 min-[860px]:sticky min-[860px]:top-6"
    >
      <div className="flex flex-col gap-1 px-2.5 pb-1">
        <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">Settings</h1>
        <span className="text-small text-fg-subtle">
          {writable ? "Kept in the project" : "Kept in this browser"}
        </span>
      </div>
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
                  document
                    .getElementById(`settings-${section.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "flex h-8 items-center gap-2.25 rounded-control px-2.5 text-control hover:bg-raised hover:text-fg",
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
