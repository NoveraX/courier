import { useCallback, useEffect, useMemo, useState } from "react";
import { Network } from "lucide-react";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { useEscapeClose } from "@/hooks/use-escape-close";
import { useActiveServer } from "@/store/mock-slice";
import { getSocket } from "@/socket";
import { deriveScenarioType } from "./scenario-utils";
import { ScenariosToolbar } from "./scenarios-toolbar";
import { ScenarioList } from "./scenario-list";
import { ScenarioDetail } from "./scenario-detail";
import { ActiveBanner } from "./active-banner";

import type { MockScenarioEntry } from "@/store/mock-slice";
import type { ScenarioType } from "./scenario-utils";

export function MockScenariosView(): React.ReactElement {
  const server = useActiveServer();
  // happy-path is the "Deactivate" control — not a regular scenario card
  const scenarios = useMemo(
    () => (server?.scenarios ?? []).filter((s) => s.name !== "happy-path"),
    [server?.scenarios],
  );

  const [selected, setSelected] = useState<MockScenarioEntry | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ScenarioType[]>([]);

  // Track when the active scenario was applied (reset on change)
  const [activeSince, setActiveSince] = useState(Date.now());
  const activeScenario = server?.activeScenario ?? null;
  useEffect(() => {
    if (activeScenario && activeScenario !== "happy-path") {
      setActiveSince(Date.now());
    }
  }, [activeScenario]);

  const closeDetail = useCallback(() => setSelected(null), []);
  useEscapeClose(selected !== null, closeDetail);

  const handleActivate = useCallback((scenario: MockScenarioEntry) => {
    if (!server) return;
    getSocket().emit("mock:command", {
      action: "mock:scenario:apply",
      serverId: server.serverId,
      scenario: scenario.name,
    });
  }, [server]);

  const handleTypeToggle = useCallback((type: ScenarioType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  // ⌘↵ activates the currently selected (open) scenario
  useEffect(() => {
    if (!selected || !server) return;
    const handler = (e: KeyboardEvent) => {
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

  const filtered = useMemo(() => {
    let list = scenarios;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
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

  if (!server) {
    return (
      <PageShell center>
        <EmptyState icon={Network} heading="No server selected" description="Select a mock server to manage its scenarios." />
      </PageShell>
    );
  }

  const isRunning = server.processStatus === "running";
  const isScenarioActive = activeScenario !== null && activeScenario !== "happy-path";
  const toolbar = (
    <ScenariosToolbar
      filtered={filtered.length}
      total={scenarios.length}
      search={search}
      onSearchChange={setSearch}
      selectedTypes={selectedTypes}
      onTypeToggle={handleTypeToggle}
    />
  );

  if (scenarios.length === 0) {
    return (
      <PageShell toolbar={toolbar} center>
        <EmptyState
          icon={Network}
          heading="No scenarios"
          description="This server has no scenarios defined yet. Add scenarios to your mock server configuration."
        />
      </PageShell>
    );
  }

  return (
    <PageShell toolbar={toolbar} noScroll>
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden${isRunning ? "" : " pointer-events-none opacity-40"}`}>
      {/* Active scenario banner — must sit inside a flex-col, not noScroll's row context */}
      {isScenarioActive && (
        <ActiveBanner
          scenarioName={activeScenario}
          activeSince={activeSince}
          requestsServed={server.scenarioRequestCount}
          serverId={server.serverId}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Network}
              heading="No matches"
              description={
                selectedTypes.length > 0
                  ? `No scenarios match the selected filters.`
                  : `No scenarios match "${search}".`
              }
            />
          ) : (
            <ScenarioList
              scenarios={filtered}
              activeScenario={server.activeScenario}
              selectedScenario={selected?.name ?? null}
              totalRoutes={server.routeCount}
              onSelect={setSelected}
              onActivate={handleActivate}
            />
          )}
        </div>

        {selected && (
          <ScenarioDetail
            scenario={selected}
            isActive={selected.name === server.activeScenario}
            totalRoutes={server.routeCount}
            serverId={server.serverId}
            onClose={closeDetail}
          />
        )}
      </div>
      </div>
    </PageShell>
  );
}
