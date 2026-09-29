import { useEffect, useState } from "react";
import { useMockStore } from "@/store/mock-slice";
import type { MockArrival } from "./mock-arrival";
import { ARRIVAL_PATIENCE_MS, mockArrival } from "./mock-arrival";

/**
 * Which of the mocks added Studio lists yet, kept current as Studio lists
 * them, and re-read once when the patience runs out so a missing one is
 * reported without any other change.
 *
 * @param keys - The keys Studio added
 * @param appliedAt - When the apply's answer arrived, in epoch milliseconds
 * @returns The arrival of the keys
 *
 * @example
 * ```tsx
 * const { listed, pending, overdue } = useMockArrival(apply.keys, apply.at);
 * ```
 */
export function useMockArrival(keys: readonly string[], appliedAt: number): MockArrival {
  const servers = useMockStore((s) => s.servers);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const remaining = appliedAt + ARRIVAL_PATIENCE_MS - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [appliedAt]);
  return mockArrival(servers, keys, now - appliedAt);
}
