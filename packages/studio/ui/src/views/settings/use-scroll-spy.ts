import { useEffect } from "react";

import { SECTION_CONFIG } from "./constants";

// ── Scroll spy — highlights active section in nav ────────────────────────────

export function useScrollSpy(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onActiveChange: (id: string) => void,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = (): void => {
      const sections = SECTION_CONFIG.map((s) => ({
        id: s.id,
        el: document.getElementById(s.id),
      }));

      for (const { id, el } of sections.reverse()) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + 100) {
          onActiveChange(id);
          return;
        }
      }
      onActiveChange(SECTION_CONFIG[0].id);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, onActiveChange]);
}
