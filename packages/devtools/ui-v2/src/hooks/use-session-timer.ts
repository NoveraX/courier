import { useEffect, useState } from "react";

import { useDevToolsStore } from "../store";

/** Formats milliseconds into "Xh Ym Zs" or "Ym Zs" or "Zs" */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Returns formatted session duration string, updating every second.
 * Returns null when no session is active.
 */
export function useSessionTimer(): string | null {
  const sessionStartedAt = useDevToolsStore((s) => s.sessionStartedAt);
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionStartedAt) {
      setElapsed(null);
      return;
    }

    const tick = () => setElapsed(formatElapsed(Date.now() - sessionStartedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sessionStartedAt]);

  return elapsed;
}
