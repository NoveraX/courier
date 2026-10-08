import { formatAbsoluteTime } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import { endpointName } from "./request-parts";
import { isStreamRequest } from "./request-state";

/** A property the Overview lists, click to copy. */
export interface RequestProperty {
  label: string;
  value: string;
  mono: boolean;
}

/** What the Overview knows beyond the request: its app's kind, and the saved session shown. */
export interface PropertyContext {
  runtimeKind?: "browser" | "server" | undefined;
  /** The saved session the requests come from, while one is shown. */
  sessionName?: string | undefined;
  /** Where the call stands among the calls sent with its idempotency key: the 2nd of 3. */
  attempt?: { at: number; of: number } | undefined;
}

function operationOf(r: RequestEntry): string {
  const type = r.type === "mutation" ? "Mutation" : "Query";
  if (!r.cache) return type;
  return `${type} · ${r.cache.hit ? "served from the cache" : "not in the cache"}`;
}

/**
 * The properties the Overview lists of a request: its endpoint, its id, the
 * app that made it, the saved session it comes from while one is shown,
 * when it started, and its operation — or, for a stream, its protocol.
 *
 * @param r - The request
 * @param context - Its app's kind, and the saved session shown
 * @returns The properties
 * @example
 * ```ts
 * requestProperties(request, { runtimeKind: "browser" })[2]; // { label: "Runtime", value: "vite-browser · browser", mono: false }
 * ```
 */
export function requestProperties(r: RequestEntry, context: PropertyContext): RequestProperty[] {
  const kind = context.runtimeKind;
  const id = r.callerRuntimeId ?? r.sessionId;
  const runtime = kind && kind !== id ? `${id} · ${kind}` : id;
  const properties: RequestProperty[] = [
    { label: "Endpoint", value: endpointName(r), mono: true },
    { label: "Request ID", value: r.id, mono: true },
    { label: "Runtime", value: runtime, mono: false },
  ];
  if (r.agent) {
    properties.push({
      label: "Agent tool",
      value: `${r.agent.tool} · ${r.agent.access}`,
      mono: true,
    });
    if (r.agent.client)
      properties.push({ label: "Agent client", value: r.agent.client, mono: false });
  }
  if (r.idempotencyKey) {
    const { attempt } = context;
    const count = attempt && attempt.of > 1 ? ` · call ${attempt.at} of ${attempt.of}` : "";
    properties.push({ label: "Idempotency key", value: `${r.idempotencyKey}${count}`, mono: true });
  }
  if (context.sessionName)
    properties.push({ label: "Session", value: context.sessionName, mono: false });
  properties.push({ label: "Started at", value: formatAbsoluteTime(r.startedAt), mono: true });
  if (isStreamRequest(r)) {
    const protocol = r.transport === "ws" ? "WebSocket" : "text/event-stream";
    properties.push({ label: "Protocol", value: protocol, mono: true });
  } else {
    properties.push({ label: "Operation", value: operationOf(r), mono: false });
  }
  return properties;
}
