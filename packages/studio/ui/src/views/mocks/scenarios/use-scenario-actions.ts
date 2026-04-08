/**
 * Hook bundling the scenario activation handlers + ⌘↵ keyboard shortcut.
 *
 * Wires up the socket commands that activate a scenario by clicking it or
 * by pressing ⌘↵ while a scenario detail is open.
 */

import { useCallback, useEffect } from "react";

import { getSocket } from "@/socket";

import type { MockScenarioEntry, MockServerInfo } from "@/store/mock-slice";

interface UseScenarioActionsOptions {
  server: MockServerInfo | null;
  selected: MockScenarioEntry | null;
}

export interface UseScenarioActionsReturn {
  handleActivate: (scenario: MockScenarioEntry) => void;
}

export function useScenarioActions({
  server,
  selected,
}: UseScenarioActionsOptions): UseScenarioActionsReturn {
  const handleActivate = useCallback(
    (scenario: MockScenarioEntry) => {
      if (!server) return;
      getSocket().emit("mock:command", {
        action: "mock:scenario:apply",
        serverId: server.serverId,
        scenario: scenario.name,
      });
    },
    [server],
  );

  // ⌘↵ activates the currently selected (open) scenario
  useEffect(() => {
    if (!selected || !server) return;
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        getSocket().emit("mock:command", {
          action: "mock:scenario:apply",
          serverId: server.serverId,
          scenario: selected.name,
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, server]);

  return { handleActivate };
}
