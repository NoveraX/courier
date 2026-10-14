import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import type { FormBodyField } from "@/features/playground/form-body";
import { describeForm, wireForm } from "@/features/playground/form-body";
import { readRequestValues } from "@/features/playground/request-values";
import { cancelServerStream } from "@/playground/cancel-server-stream";
import { useSendRequest } from "@/playground/use-send-request";
import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import type { BodyKind } from "./request-pane";
import type { SendAction } from "./send-button";

/** What a run is made of: the endpoint, the editors' texts, the mode, the body, and the run shown. */
export interface RunInput {
  endpoint: PlaygroundEndpoint;
  variables: string;
  headers: string;
  mode: "direct" | "proxy";
  /** Sets the Playground's mode, as running the call as server code does. */
  onMode: (mode: "direct" | "proxy") => void;
  body: { kind: BodyKind; fields: readonly FormBodyField[] };
  shown: PlaygroundHistoryEntry | null;
  onSent: (stream: boolean) => void;
}

/**
 * The Playground's primary action and what runs it: Send for a call — a
 * form's files read first — Subscribe for a stream, Unsubscribe while one
 * is open, nothing while a call is in flight; ⌘↵ or Ctrl+Enter runs it too. A call in
 * flight can be cancelled. Run as server code switches to Direct mode and
 * runs the call there at once, where server code reaches every endpoint.
 *
 * @param input - The endpoint, the editors, the mode and what sets it, the body, the run shown and what follows a send
 * @returns The action, what runs it, and what cancels a call in flight
 * @example
 * ```ts
 * const { action, primary } = usePlaygroundRun({ endpoint, variables, headers, mode, onMode, body, shown, onSent });
 * ```
 */
export function usePlaygroundRun(input: RunInput): {
  action: SendAction;
  primary: () => void;
  /** Runs the call as server code, in Direct mode; `undefined` while a call or a stream is under way. */
  runAsServer: (() => void) | undefined;
  cancel: () => void;
} {
  const { endpoint, variables, headers, mode, onMode, body, shown, onSent } = input;
  const { send, streaming, unsubscribe } = useSendRequest();
  const updateEntry = useStudioStore((s) => s.updatePlaygroundEntry);
  const runAs = useCallback(
    (as: "direct" | "proxy") => {
      const asForm = body.kind === "form" && endpoint.transport === "http";
      const request = readRequestValues(asForm ? "{}" : variables, headers);
      if (!request.ok) return void toast.error(request.problem);
      const transport = endpoint.transport === "http" ? undefined : endpoint.transport;
      const call = {
        source: endpoint.source,
        group: endpoint.group,
        method: endpoint.method,
        headers,
        mode: as,
        transport,
      };
      onSent(transport !== undefined);
      if (!asForm) return void send({ ...call, variables }, request.values);
      wireForm(body.fields).then(
        (form) =>
          send(
            { ...call, variables: describeForm(body.fields), form },
            { variables: undefined, headers: request.values.headers },
          ),
        (error: unknown) => toast.error(`Could not read the form's files: ${String(error)}`),
      );
    },
    [endpoint, variables, headers, body, send, onSent],
  );
  const run = useCallback(() => runAs(mode), [runAs, mode]);
  const inFlight = shown?.status === "pending" && shown.transport === undefined;
  const action: SendAction = streaming
    ? "unsubscribe"
    : inFlight
      ? "sending"
      : endpoint.transport === "http"
        ? "send"
        : "subscribe";
  const primary = streaming ? unsubscribe : inFlight ? () => undefined : run;
  const cancel = useCallback(() => {
    if (shown?.status !== "pending") return;
    cancelServerStream(shown.rid);
    updateEntry(shown.id, { status: "error", response: "Cancelled before an answer came" });
  }, [shown, updateEntry]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter" || event.defaultPrevented)
        return;
      event.preventDefault();
      primary();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [primary]);
  const runAsServer =
    action === "send" || action === "subscribe"
      ? () => {
          onMode("direct");
          runAs("direct");
        }
      : undefined;
  return { action, primary, runAsServer, cancel };
}
