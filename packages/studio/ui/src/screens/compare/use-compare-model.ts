import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

import type { PairPreset, RequestPair } from "@/features/compare/compare-pairs";
import { comparable, pairOf } from "@/features/compare/compare-pairs";
import type { CompareSearch, CompareTab } from "@/features/compare/compare-search";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types-request";

/** The two requests Compare shows, where they came from, and what changes them. */
export interface CompareModel {
  candidates: RequestEntry[];
  /** `null` while fewer than two calls can be compared. */
  pair: RequestPair | null;
  /** The ready-made pair last chosen, if any. */
  preset: PairPreset | null;
  /** A side the address named that Studio no longer holds. */
  missing: boolean;
  tab: CompareTab;
  pick: (side: "a" | "b", id: string) => void;
  applyPreset: (preset: PairPreset) => boolean;
  swap: () => void;
  setTab: (tab: CompareTab) => void;
}

/* What Compare opens on: a success against a failure, else the newest two of an endpoint. */
function openingPair(
  candidates: readonly RequestEntry[],
): { preset: PairPreset; pair: RequestPair } | null {
  const failure = pairOf(candidates, "failure");
  if (failure) return { preset: "failure", pair: failure };
  const latest = pairOf(candidates, "latest");
  return latest ? { preset: "latest", pair: latest } : null;
}

/**
 * Compare's model: the calls the address names — or, until it names any,
 * a success against a failure, else the newest two of an endpoint, written
 * into the address so the pair holds still as traffic arrives — the
 * ready-made pair last chosen, which stays chosen while a side is picked by
 * hand, and what picks, swaps and switches.
 *
 * @returns The model
 * @example
 * ```ts
 * const { pair, pick } = useCompareModel();
 * ```
 */
export function useCompareModel(): CompareModel {
  const search: CompareSearch = useSearch({ from: "/compare" });
  const navigate = useNavigate({ from: "/compare" });
  const candidates = comparable(useStudioStore((s) => s.requests));
  const opening = openingPair(candidates);
  const named = (id: string | undefined) => (id ? candidates.find((r) => r.id === id) : undefined);
  const a = named(search.a) ?? opening?.pair[0];
  const b = named(search.b) ?? opening?.pair[1];
  const pair: RequestPair | null = a && b ? [a, b] : null;
  const go = (next: CompareSearch): void =>
    void navigate({ search: (prev) => ({ req: prev.req, tab: prev.tab, ...next }), replace: true });
  const keep = { a: pair?.[0].id, b: pair?.[1].id, show: search.show, pair: search.pair };
  const unnamed = search.a === undefined && search.b === undefined;
  const openingA = opening?.pair[0].id;
  const openingB = opening?.pair[1].id;
  const openingPreset = opening?.preset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: written once, when the address names no pair yet; later traffic must not move it
  useEffect(() => {
    if (unnamed && openingA && openingB)
      void navigate({
        search: (prev) => ({ ...prev, a: openingA, b: openingB, pair: openingPreset }),
        replace: true,
      });
  }, [unnamed, openingA !== undefined]);
  return {
    candidates,
    pair,
    preset: search.pair ?? (unnamed ? (openingPreset ?? null) : null),
    missing:
      (search.a !== undefined && !named(search.a)) || (search.b !== undefined && !named(search.b)),
    tab: search.show ?? "response",
    pick: (side, id) => go({ ...keep, [side]: id }),
    applyPreset: (p) => {
      const ready = pairOf(candidates, p);
      if (ready) go({ ...keep, a: ready[0].id, b: ready[1].id, pair: p });
      return ready !== null;
    },
    swap: () => go({ ...keep, a: keep.b, b: keep.a }),
    setTab: (tab) => go({ ...keep, show: tab === "response" ? undefined : tab }),
  };
}
