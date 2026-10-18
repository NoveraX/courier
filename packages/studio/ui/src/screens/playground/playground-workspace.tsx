import { playgroundRequestId } from "@noverax/courier-studio-core";
import { useState } from "react";

import { MEDIA } from "@/design/breakpoints";
import { endpointKey } from "@/features/explorer/endpoint-key";
import { editorCheckOf, refusalOf } from "@/features/playground/editor-check";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import type { FormBodyField } from "@/features/playground/form-body";
import { emptyField } from "@/features/playground/form-body";
import { parseJsonc } from "@/features/playground/jsonc-helpers";
import { proxyRouteOf } from "@/features/playground/proxy-route";
import { requestUrlParts } from "@/features/playground/request-url";
import { useLiveNow } from "@/hooks/use-live-now";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-tick";
import type { PayloadMode } from "@/inspector/tabs/payload-tab";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import { answerMark } from "./answer-mark";
import type { PaneView } from "./pane-switch";
import { PlaygroundPanes } from "./playground-panes";
import { PlaygroundToolbar } from "./playground-toolbar";
import type { BodyKind, EditorTab } from "./request-pane";
import { RequestPane } from "./request-pane";
import type { ResponseTab } from "./response-content";
import { ResponsePane } from "./response-pane";
import { usePlaygroundActions } from "./use-playground-actions";
import { usePlaygroundEditors } from "./use-playground-editors";
import { usePlaygroundRun } from "./use-playground-run";

interface PlaygroundWorkspaceProps {
  choices: readonly PlaygroundEndpoint[];
  endpoint: PlaygroundEndpoint;
  onChoose: (endpoint: PlaygroundEndpoint) => void;
}

/**
 * The Playground at work: the bar over the request and the response, side
 * by side — stacked on a narrow window, one at a time on a phone, where a
 * send or a recent send brought back shows the response and choosing
 * another endpoint its request — for the endpoint chosen, its last run
 * shown until another endpoint is chosen.
 *
 * @param props - The endpoints, the one chosen, and what chooses another
 * @returns The workspace
 * @example
 * ```tsx
 * <PlaygroundWorkspace choices={choices} endpoint={endpoint} onChoose={choose} />
 * ```
 */
export function PlaygroundWorkspace({
  choices,
  endpoint,
  onChoose,
}: PlaygroundWorkspaceProps): React.ReactNode {
  const editors = usePlaygroundEditors(endpoint);
  const [tab, setTab] = useState<EditorTab>("variables");
  const [bodyKind, setBodyKind] = useState<BodyKind>("json");
  const [fields, setFields] = useState<FormBodyField[]>(() => [emptyField()]);
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [payloadMode, setPayloadMode] = useState<PayloadMode>("tree");
  const [view, setView] = useState<PaneView>("request");
  const phone = useMediaQuery(MEDIA.phone);
  const short = useMediaQuery(MEDIA.shortScreen);
  const showResponse = (next: ResponseTab) => {
    setResponseTab(next);
    setView("response");
  };
  const active = useStudioStore((s) => s.playgroundActiveResponse);
  const shown = active && endpointKey(active) === endpoint.key ? active : null;
  const row = useStudioStore((s) =>
    shown ? s.requests.find((r) => r.id === playgroundRequestId(shown.rid)) : undefined,
  );
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const { open } = useInspector();
  const ticking =
    (shown?.status === "pending" && !shown.transport) || shown?.streamStatus === "streaming";
  const now = Math.max(useNow(), useLiveNow(ticking));
  const parsed = parseJsonc(editors.variables.text);
  const parts = requestUrlParts(endpoint, parsed.ok ? parsed.value : undefined);
  const name = [endpoint.group, endpoint.method].filter(Boolean).join(".");
  const asForm = bodyKind === "form" && endpoint.transport === "http";
  const check = editorCheckOf(
    { tab, variables: editors.variables.text, headers: editors.headers.text, asForm },
    endpoint.def,
    name,
    refusalOf(shown, row),
  );
  const run = usePlaygroundRun({
    endpoint,
    variables: editors.variables.text,
    headers: editors.headers.text,
    mode: editors.mode,
    onMode: editors.setMode,
    body: { kind: bodyKind, fields },
    shown,
    onSent: (stream) => showResponse(stream ? "messages" : "body"),
  });
  const actions = usePlaygroundActions({
    endpoint,
    editors,
    tab,
    choices,
    onChoose,
    onShow: showResponse,
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlaygroundToolbar
        choices={choices}
        endpoint={endpoint}
        onChoose={(next) => {
          setView("request");
          onChoose(next);
        }}
        mode={editors.mode}
        onMode={editors.setMode}
        history={{ now, labelOf: actions.labelOf, onPick: actions.restore }}
        action={run.action}
        onPrimary={run.primary}
      />
      <PlaygroundPanes
        layout={phone ? "single" : short ? "split" : "auto"}
        view={view}
        onView={setView}
        mark={answerMark(shown, row)}
        request={
          <RequestPane
            endpoint={endpoint}
            url={{
              parts,
              proxy:
                editors.mode === "proxy"
                  ? (proxyRouteOf(endpoint.transport, endpoint.entry) ?? null)
                  : undefined,
              onRunAsServer: run.runAsServer,
            }}
            tab={tab}
            onTab={setTab}
            variables={editors.variables}
            headers={editors.headers}
            body={{ kind: bodyKind, onKind: setBodyKind, fields, onFields: setFields }}
            check={check}
            onPrettify={actions.prettify}
            onCopy={actions.copy}
          />
        }
        response={
          <ResponsePane
            entry={shown}
            row={row}
            tab={responseTab}
            onTab={setResponseTab}
            payload={{ mode: payloadMode, onMode: setPayloadMode }}
            now={now}
            slowMs={slowMs}
            sendingLabel={`${endpoint.label} ${parts.map((p) => p.text).join("")}`}
            onInspect={open}
            onCancel={run.cancel}
            onRunAsServer={run.runAsServer}
          />
        }
      />
    </div>
  );
}
