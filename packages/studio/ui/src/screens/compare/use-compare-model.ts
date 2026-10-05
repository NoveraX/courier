import { useNavigate, useSearch } from "@tanstack/react-router";

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
  /** The ready-made pair the two requests are, if any. */
  preset: PairPreset | null;
  /** A side the address named that Studio no longer holds. */
  missing: boolean;
  tab: CompareTab;
  pick: (side: "a" | "b", id: string) => void;
  applyPreset: (preset: PairPreset) => boolean;
  swap: () => void;
  setTab: (tab: CompareTab) => void;
}

const PRESETS: readonly PairPreset[] = ["failure", "slow", "latest"];

/**
 * Compare's model: the calls the address names — or, until it names any,
 * a success against a failure, else the newest two of an endpoint — the
 * ready-made pair they are, and what picks, swaps and switches.
 *
 * @returns The model
 * @example
 * ```ts
 * const { pair, pick } = useCompareModel();
 * ```
 */
export function useCompareModel(): CompareModel {
  const search: CompareSearch = useSearch({ from: "/next/compare" });
  const navigate = useNavigate({ from: "/next/compare" });
  const candidates = comparable(useStudioStore((s) => s.requests));
  const fallback = pairOf(candidates, "failure") ?? pairOf(candidates, "latest");
  const named = (id: string | undefined) => (id ? candidates.find((r) => r.id === id) : undefined);
  const a = named(search.a) ?? fallback?.[0];
  const b = named(search.b) ?? fallback?.[1];
  const pair: RequestPair | null = a && b ? [a, b] : null;
  const preset =
    PRESETS.find((p) => {
      const ready = pairOf(candidates, p);
      return (
        ready !== null && pair !== null && ready[0].id === pair[0].id && ready[1].id === pair[1].id
      );
    }) ?? null;
  const go = (next: CompareSearch): void =>
    void navigate({ search: (prev) => ({ req: prev.req, tab: prev.tab, ...next }), replace: true });
  const keep = { a: pair?.[0].id, b: pair?.[1].id, show: search.show };
  return {
    candidates,
    pair,
    preset,
    missing:
      (search.a !== undefined && !named(search.a)) || (search.b !== undefined && !named(search.b)),
    tab: search.show ?? "response",
    pick: (side, id) => go({ ...keep, [side]: id }),
    applyPreset: (p) => {
      const ready = pairOf(candidates, p);
      if (ready) go({ ...keep, a: ready[0].id, b: ready[1].id });
      return ready !== null;
    },
    swap: () => go({ ...keep, a: keep.b, b: keep.a }),
    setTab: (tab) => go({ ...keep, show: tab === "response" ? undefined : tab }),
  };
}
