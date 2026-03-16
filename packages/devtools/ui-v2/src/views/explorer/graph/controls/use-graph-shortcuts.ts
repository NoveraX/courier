import { useEffect } from "react";
import type { RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

/**
 * Registers keyboard shortcuts for the graph view.
 * - Cmd/Ctrl+F → focuses search input
 * - Cmd/Ctrl+0 → fits graph to view
 */
export function useGraphShortcuts(
  inputRef: RefObject<HTMLInputElement | null>,
  fitView: ReactFlowInstance["fitView"],
): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "f") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "0") {
        e.preventDefault();
        fitView({ padding: 0.15, duration: 300 });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputRef, fitView]);
}
