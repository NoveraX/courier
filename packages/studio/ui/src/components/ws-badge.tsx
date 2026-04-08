import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store";

/** Compact inline WS count for status bar */
export function WsBadge(): React.ReactElement | null {
  const requests = useStudioStore((s) => s.requests);
  const { active, total } = countWs(requests);
  if (total === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-sky-400">
      {active > 0 && <span className="size-1.5 animate-pulse rounded-full bg-sky-400" />}
      <span className="tabular-nums">{active > 0 ? active : total} ws</span>
    </span>
  );
}

function countWs(requests: RequestEntry[]): { active: number; total: number } {
  let active = 0;
  let total = 0;
  for (const r of requests) {
    if (r.transport !== "ws") continue;
    total++;
    if (r.streamStatus === "streaming") active++;
  }
  return { active, total };
}
