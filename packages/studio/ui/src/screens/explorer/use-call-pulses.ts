import { useCallback, useEffect, useRef, useState } from "react";

import type { Pulse } from "@/features/explorer/call-pulses";
import { endedCalls, pulseOf } from "@/features/explorer/call-pulses";
import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import type { GraphBranch } from "@/features/explorer/graph-types";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useStudioStore } from "@/store";

/* At most this many calls run at once; one more waits for none — it is not drawn. */
const MOST = 40;
/* One endpoint's calls that end closer together than this run as one. */
const GAP_MS = 90;
/* The calls looked at are forgotten past this many, keeping only the ones Studio still holds. */
const REMEMBERED = 6_000;

/**
 * The calls running on the graph: each call that ends from now on runs
 * once along its endpoint's branch, coloured by how it went. Calls that
 * ended before, or while the page was hidden, do not run; none do while
 * the reader asks for less motion.
 *
 * @param branches - Each endpoint's branch, by its key
 * @param slowMs - Studio's slow-request threshold
 * @returns The pulses, and what a pulse that ran its way calls
 * @example
 * ```tsx
 * const { pulses, done } = useCallPulses(layout.branches, slowMs);
 * ```
 */
export function useCallPulses(
  branches: ReadonlyMap<string, GraphBranch>,
  slowMs: number,
): { pulses: readonly Pulse[]; done: (id: string) => void } {
  const still = useReducedMotion();
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const latest = useRef({ branches, slowMs });
  useEffect(() => {
    latest.current = { branches, slowMs };
  });
  useEffect(() => {
    if (still) return;
    const seen = new Set<string>();
    endedCalls(useStudioStore.getState().requests, seen);
    const lastAt = new Map<string, number>();
    return useStudioStore.subscribe((state, prev) => {
      if (state.requests === prev.requests) return;
      if (seen.size > REMEMBERED) {
        seen.clear();
        endedCalls(prev.requests, seen);
      }
      const ended = endedCalls(state.requests, seen);
      if (document.hidden || ended.length === 0) return;
      const now = performance.now();
      const fresh: Pulse[] = [];
      for (const call of ended) {
        const key = endpointKeyOf(call);
        const branch = latest.current.branches.get(key);
        if (!branch || now - (lastAt.get(key) ?? Number.NEGATIVE_INFINITY) < GAP_MS) continue;
        lastAt.set(key, now);
        fresh.push(pulseOf(call, branch, latest.current.slowMs));
      }
      if (!fresh.length) return;
      setPulses((running) => [...running, ...fresh.slice(0, Math.max(0, MOST - running.length))]);
    });
  }, [still]);
  const done = useCallback((id: string) => {
    setPulses((running) => running.filter((pulse) => pulse.id !== id));
  }, []);
  return { pulses: still ? [] : pulses, done };
}
