import { playgroundRequestId } from "@noverax/courier-studio-core";
import { useState } from "react";

import { endpointKey } from "@/features/explorer/endpoint-key";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import type { FormBodyField } from "@/features/playground/form-body";
import { emptyField } from "@/features/playground/form-body";
import type { InputCheck } from "@/features/playground/input-check";
import { headersCheckOf, variablesCheckOf } from "@/features/playground/input-check";
import { parseJsonc } from "@/features/playground/jsonc-helpers";
import { proxyRouteOf } from "@/features/playground/proxy-route";
import { requestUrlParts } from "@/features/playground/request-url";
import { useLiveNow } from "@/hooks/use-live-now";
import { useNow } from "@/hooks/use-tick";
import type { PayloadMode } from "@/inspector/tabs/payload-tab";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
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
 * by side — stacked on a narrow window — for the endpoint chosen, its last
 * run shown until another endpoint is chosen.
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
  const check: InputCheck =
    tab === "headers"
      ? headersCheckOf(editors.headers.text)
      : asForm
        ? { tone: "ok", label: "Sent as multipart form data in place of the variables" }
        : variablesCheckOf(editors.variables.text, endpoint.def.variablesFields, name);
  const run = usePlaygroundRun({
    endpoint,
    variables: editors.variables.text,
    headers: editors.headers.text,
    mode: editors.mode,
    body: { kind: bodyKind, fields },
    shown,
    onSent: (stream) => setResponseTab(stream ? "messages" : "body"),
  });
  const actions = usePlaygroundActions({
    endpoint,
    editors,
    tab,
    choices,
    onChoose,
    onShow: setResponseTab,
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlaygroundToolbar
        choices={choices}
        endpoint={endpoint}
        onChoose={onChoose}
        mode={editors.mode}
        onMode={editors.setMode}
        history={{ now, labelOf: actions.labelOf, onPick: actions.restore }}
        action={run.action}
        onPrimary={run.primary}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-[900px]:auto-rows-[minmax(420px,auto)] max-[900px]:grid-cols-1 max-[900px]:overflow-auto">
        <RequestPane
          endpoint={endpoint}
          url={{
            parts,
            proxy:
              editors.mode === "proxy"
                ? (proxyRouteOf(endpoint.transport, endpoint.entry) ?? null)
                : undefined,
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
        />
      </div>
    </div>
  );
}
