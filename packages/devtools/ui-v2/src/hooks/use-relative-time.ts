import { useEffect } from "react";

import { useDevToolsStore } from "@/store";

/**
 * Starts a global interval that bumps `store.relativeTick` every 15s
 * when timestampFormat is "relative". Call once in root layout.
 *
 * Components read `relativeTick` via selector — zustand batches updates,
 * so only visible components re-render. When format is "absolute",
 * interval stops and tick is never bumped.
 */

const INTERVAL_MS = 15_000;

export function useRelativeTimeTick(): void {
  const isRelative = useDevToolsStore(
    (s) => s.settings.timestampFormat === "relative",
  );

  useEffect(() => {
    if (!isRelative) return;

    const id = setInterval(() => {
      useDevToolsStore.setState((s) => ({ relativeTick: s.relativeTick + 1 }));
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [isRelative]);
}
