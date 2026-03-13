import { useEffect } from "react";

type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Registers global keyboard shortcuts.
 * Keys use format: "mod+k", "mod+1", "mod+b", "Escape"
 * "mod" maps to Meta on macOS, Ctrl elsewhere.
 */
export function useHotkeys(map: HotkeyMap): void {
  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      // Skip when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Allow Escape and mod+k even in inputs
        if (e.key !== "Escape" && !(e.key === "k" && (e.metaKey || e.ctrlKey))) {
          return;
        }
      }

      const mod = e.metaKey || e.ctrlKey;
      const parts: string[] = [];
      if (mod) parts.push("mod");
      if (e.shiftKey) parts.push("shift");
      parts.push(e.key.toLowerCase());

      const combo = parts.join("+");
      const action = map[combo] ?? map[e.key];
      if (action) {
        e.preventDefault();
        action(e);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}
