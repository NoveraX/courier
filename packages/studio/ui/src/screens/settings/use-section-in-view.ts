import { useEffect, useState } from "react";

import { SECTION_GROUPS } from "./settings-sections";

const IDS = SECTION_GROUPS.flatMap((group) => group.sections.map((s) => s.id));

/* What the row of section chips covers at the top of the page while it stays in view, and a little
   more: a section under it is not the one being read. */
const CHIPS_COVER = "-56px";

/**
 * The section of Settings in view: of those crossing the top third of the
 * window, the one nearest its top, as the observer reports them crossing.
 * Under the row of chips a narrow window keeps at the top, the third is
 * the page's own, below the row. The first section until the page has
 * scrolled.
 *
 * @param chips - Whether the row of section chips covers the top of the page
 * @returns The section's id
 * @example
 * ```ts
 * const inView = useSectionInView(false); // "appearance"
 * ```
 */
export function useSectionInView(chips: boolean): string {
  const [inView, setInView] = useState(IDS[0] ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const sections = IDS.flatMap((id) => document.getElementById(`settings-${id}`) ?? []);
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setInView(top.target.id.replace(/^settings-/, ""));
      },
      chips
        ? { root: sections[0]?.closest("main") ?? null, rootMargin: `${CHIPS_COVER} 0px -70% 0px` }
        : { rootMargin: "0px 0px -70% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [chips]);
  return inView;
}

/**
 * Scrolls a section of Settings to the top of the view.
 *
 * @param id - The section's id
 * @param still - The reader asked for less motion: jump rather than glide
 * @example
 * ```ts
 * scrollToSection("display", false);
 * ```
 */
export function scrollToSection(id: string, still: boolean): void {
  document
    .getElementById(`settings-${id}`)
    ?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
}
