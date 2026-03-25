import { useState } from "react";
import { BookmarkPlus, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMockStore } from "@/store/mock-slice";
import { getSocket } from "@/socket";

import type { MockServerInfo, SavedScenario } from "@/store/mock-slice";

interface ScenarioManagerProps {
  server: MockServerInfo;
  /** Current active chaos mode label for saving */
  currentMode: string;
}

export function ScenarioManager({ server, currentMode }: ScenarioManagerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const scenarios = server.savedScenarios ?? [];

  // TODO: persist saved scenarios to backend via mock:command so they survive page refresh
  // 1. Send "mock:scenario:network:save" command with scenario payload
  // 2. Backend stores in BridgeContext (or file-based storage)
  // 3. On reconnect, server sends saved scenarios list in emitConnect snapshot
  // 4. handleLoad/handleDelete should also sync via commands
  const handleSave = () => {
    if (!saveName.trim()) return;
    const scenario: SavedScenario = {
      id: `${Date.now()}`,
      name: saveName.trim(),
      createdAt: Date.now(),
      chaosMode: currentMode,
      networkConfig: server.networkConfig ?? { latency: 0, errorRate: 0 },
      networkPreset: server.networkPreset,
    };
    useMockStore.getState().saveScenario(server.serverId, scenario);
    setSaveName("");
    setSaving(false);
  };

  const handleLoad = (scenario: SavedScenario) => {
    useMockStore.getState().updateServer(server.serverId, {
      networkPreset: scenario.networkPreset,
      networkConfig: scenario.networkConfig,
      faultStartedAt: scenario.networkPreset !== "none" ? Date.now() : null,
    });
    getSocket().emit("mock:command", {
      action: "mock:network:set",
      serverId: server.serverId,
      config: scenario.networkConfig,
      preset: scenario.networkPreset,
    });
  };

  const handleDelete = (id: string) => {
    useMockStore.getState().deleteScenario(server.serverId, id);
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/40 ring-1 ring-border-subtle">
          <BookmarkPlus className="size-3.5 text-muted-foreground/50" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-body-sm font-semibold text-foreground">Saved Scenarios</h3>
          <p className="text-body-xs text-muted-foreground/60">Save and restore configurations</p>
        </div>
        {scenarios.length > 0 && (
          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-caption text-muted-foreground/60">
            {scenarios.length}
          </span>
        )}
        <ChevronDown className={cn("size-3.5 text-muted-foreground/40 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border-subtle p-4">
          {/* Save current */}
          {saving ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaving(false); }}
                placeholder="Scenario name…"
                className="h-7 flex-1 rounded-md border border-border-subtle bg-muted/20 px-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent-brand/50"
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!saveName.trim()}>Save</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSaving(false)}>Cancel</Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={() => setSaving(true)}
            >
              <BookmarkPlus className="size-3" />
              Save Current Config
            </Button>
          )}

          {/* Scenario list */}
          {scenarios.length === 0 ? (
            <p className="text-center text-body-xs text-muted-foreground/40">No saved scenarios</p>
          ) : (
            <div className="space-y-1.5">
              {scenarios.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-muted/20 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-body-xs font-medium text-foreground/80">{s.name}</p>
                    <p className="text-caption text-muted-foreground/40">{s.chaosMode} · {new Date(s.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-accent-brand hover:text-accent-brand" onClick={() => handleLoad(s)}>Load</Button>
                  <button type="button" onClick={() => handleDelete(s.id)} className="text-muted-foreground/30 hover:text-rose-400 transition-colors">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
