import { useEffect, useCallback } from "react";
import { Play } from "lucide-react";
import { useSearch } from "@tanstack/react-router";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { useDevToolsStore } from "@/store";

import { usePlayground } from "./use-playground";
import { useSendRequest } from "./use-send-request";
import { PlaygroundToolbar } from "./toolbar";
import { RequestPanel } from "./request-panel";
import { ResponsePanel } from "./response-panel";
import { HistoryBar } from "./history-bar";

import type { PlaygroundHistoryEntry } from "@/store/types-ui";

export function PlaygroundView(): React.ReactElement {
  const connected = useDevToolsStore((s) => s.connected);
  const activeResponse = useDevToolsStore((s) => s.playgroundActiveResponse);
  const setActiveResponse = useDevToolsStore((s) => s.setPlaygroundActiveResponse);
  const search = useSearch({ from: "/playground" });

  const pg = usePlayground(search);
  const { send, sending } = useSendRequest();

  const handleSend = useCallback(() => {
    if (!pg.canSend || sending) return;
    send({
      source: pg.source,
      group: pg.group,
      method: pg.method,
      variables: pg.variables,
      headers: pg.headers,
      mode: pg.mode,
    });
    pg.setResponseTab("body");
  }, [send, sending, pg]);

  // Cmd+Enter to send
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleSend]);

  const handleHistorySelect = (entry: PlaygroundHistoryEntry) => {
    setActiveResponse(entry);
    pg.selectEndpoint(entry.source, entry.group, entry.method);
    pg.setVariables(entry.variables);
    pg.setHeaders(entry.headers);
    pg.setMode(entry.mode);
    pg.setResponseTab("body");
  };

  if (!connected || pg.sources.length === 0) {
    return (
      <PageShell center>
        <EmptyState
          icon={Play}
          heading="No app connected"
          description="Start your app with Nexus DevTools enabled to use the playground."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      noScroll
      toolbar={
        <PlaygroundToolbar
          sources={pg.sources}
          groups={pg.groups}
          methods={pg.methods}
          source={pg.source}
          group={pg.group}
          method={pg.method}
          mode={pg.mode}
          endpointInfo={pg.endpointInfo}
          sending={sending}
          canSend={pg.canSend}
          onSourceChange={pg.setSource}
          onGroupChange={pg.setGroup}
          onMethodChange={pg.setMethod}
          onModeChange={pg.setMode}
          onSend={handleSend}
          historySlot={
            <HistoryBar
              activeId={activeResponse?.id ?? null}
              onSelect={handleHistorySelect}
            />
          }
        />
      }
    >
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={45} minSize={25}>
          <RequestPanel
            variables={pg.variables}
            headers={pg.headers}
            endpointInfo={pg.endpointInfo}
            sourceInfo={pg.sourceInfo}
            groupPrefix={pg.groupPrefix}
            onVariablesChange={pg.setVariables}
            onHeadersChange={pg.setHeaders}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={55} minSize={25}>
          <ResponsePanel
            entry={activeResponse}
            activeTab={pg.responseTab}
            onTabChange={pg.setResponseTab}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </PageShell>
  );
}
