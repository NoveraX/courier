/**
 * Search + type filter hook for the scenarios list: owns the search string
 * and the selected type filter set, and returns the filtered scenarios
 * memoized against the inputs.
 */

import { useCallback, useMemo, useState } from "react";
import type { MockScenarioEntry } from "@/store/mock-slice";
import { deriveScenarioType, type ScenarioType } from "./scenario-utils";

export interface UseScenarioFilterReturn {
  search: string;
  setSearch: (value: string) => void;
  selectedTypes: ScenarioType[];
  toggleType: (type: ScenarioType) => void;
  filtered: MockScenarioEntry[];
}

/** Build a filtered scenario list from the search query and active type filters. */
export function useScenarioFilter(scenarios: MockScenarioEntry[]): UseScenarioFilterReturn {
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ScenarioType[]>([]);

  const toggleType = useCallback((type: ScenarioType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const filtered = useMemo(() => {
    let list = scenarios;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description?.toLowerCase().includes(q) ?? false) ||
          (s.tags?.some((t) => t.toLowerCase().includes(q)) ?? false),
      );
    }
    if (selectedTypes.length > 0) {
      list = list.filter((s) => selectedTypes.includes(deriveScenarioType(s)));
    }
    return list;
  }, [scenarios, search, selectedTypes]);

  return { search, setSearch, selectedTypes, toggleType, filtered };
}
