import { useSearch } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { describeForm, wireForm } from "./form-body";
import { HistoryBar } from "./history-bar";
import { RequestPanel } from "./request-panel";
import { readRequestValues } from "./request-values";
import { ResponsePanel } from "./response-panel";
import { PlaygroundToolbar } from "./toolbar";
import { usePlayground } from "./use-playground";
import { useSendRequest } from "./use-send-request";

export function PlaygroundView(): React.ReactElement {
  const connected = useStudioStore((s) => s.connected);
  const runtimeCount = useStudioStore((s) => s.bindingSnapshot.runtimeCount);
  const activeResponse = useStudioStore((s) => s.playgroundActiveResponse);
  const setActiveResponse = useStudioStore((s) => s.setPlaygroundActiveResponse);
  const search = useSearch({ from: "/playground" });
  const hasApp = runtimeCount > 0;

  const pg = usePlayground(search);
  const { send, sending, streaming, unsubscribe } = useSendRequest();
  const isRealtime = pg.endpointInfo?.transport === "sse" || pg.endpointInfo?.transport === "ws";

  const handleSend = useCallback(() => {
    if (!pg.canSend || sending || streaming) return;
    const asForm = pg.bodyKind === "form" && !isRealtime;
    /* A form's fields are its body; only the headers are read as JSON then. */
    const request = readRequestValues(asForm ? "{}" : pg.variables, pg.headers);
    if (!request.ok) {
      toast.error(request.problem);
      return;
    }
    const payload = {
      source: pg.source,
      group: pg.group,
      method: pg.method,
      variables: asForm ? describeForm(pg.formFields) : pg.variables,
      headers: pg.headers,
      mode: pg.mode,
      transport: pg.endpointInfo?.transport,
    };
    pg.setResponseTab(isRealtime ? "stream" : "body");
    if (!asForm) {
      send(payload, request.values);
      return;
    }
    wireForm(pg.formFields).then(
      (form) =>
        send({ ...payload, form }, { variables: undefined, headers: request.values.headers }),
      (error: unknown) => toast.error(`Could not read the form's files: ${String(error)}`),
    );
  }, [send, sending, streaming, pg, isRealtime]);

  // Cmd+Enter sends, as the Send button does; while a stream is live the
  // button is Unsubscribe, and the shortcut sends nothing.
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
    pg.setResponseTab(entry.transport ? "stream" : "body");
  };

  if (!connected || !hasApp) {
    return (
      <PageShell center>
        <EmptyState
          icon={Play}
          heading="No app connected"
          description="Start your app with Courier Studio enabled to use the playground."
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
          sourceInfo={pg.sourceInfo}
          endpointInfo={pg.endpointInfo}
          sending={sending}
          canSend={pg.canSend}
          streaming={streaming}
          onSourceChange={pg.setSource}
          onGroupChange={pg.setGroup}
          onMethodChange={pg.setMethod}
          onModeChange={pg.setMode}
          onSend={handleSend}
          onUnsubscribe={unsubscribe}
          historySlot={
            <HistoryBar activeId={activeResponse?.id ?? null} onSelect={handleHistorySelect} />
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
            body={{
              kind: pg.bodyKind,
              formFields: pg.formFields,
              onKindChange: pg.setBodyKind,
              onFormFieldsChange: pg.setFormFields,
            }}
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
