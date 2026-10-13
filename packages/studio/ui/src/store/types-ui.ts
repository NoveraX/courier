import type { ProxyPath } from "@noverax/courier";
import type { SchemaField } from "@noverax/courier-studio-core";
import type { AgentMark } from "@/features/apis/types";
import type { ProxyTiming, RequestStatus, RequestTiming } from "./types";

// ── Theme ───────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light" | "system";

// ── Connection state ────────────────────────────────────────────────────────

/** `connecting` until the page's first connection to Studio settles. */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

// ── Catalog (server-authoritative merged source map) ────────────────────────

export interface CatalogEndpoint {
  type: "query" | "mutation" | undefined;
  hasVariablesSchema: boolean;
  hasResponseSchema: boolean;
  path?: string;
  httpMethod?: string;
  middleware?: string[];
  /** Default variables stub from schema introspection */
  variablesStub?: Record<string, unknown>;
  /** The fields the variables schema declares, with their types and whether each is required */
  variablesFields?: SchemaField[];
  origin: "scan" | "runtime" | "both";
  /** Transport mode — only present for SSE/WS endpoints */
  transport?: "sse" | "ws";
  /** True when WS channel has a receive schema (bidirectional) */
  hasReceiveSchema?: boolean;
  /** True when the app serves it itself: a stream or a channel it implements */
  served?: boolean;
  /** What the project's `agents` policy decided for it, as the config declares it. */
  agent?: AgentMark;
}

export interface CatalogGroup {
  prefix: string;
  endpoints: Record<string, CatalogEndpoint>;
}

export interface CatalogEntry {
  baseURL: string;
  /**
   * The user-app's own HTTP origin (e.g. `http://localhost:3000`): the one
   * its runtime listens on, or `runtime.appOrigin` in courier.config. Used
   * by the Playground to resolve relative `proxyPath` values into full
   * clickable URLs. Omitted when Studio knows none.
   */
  appOrigin?: string;
  /**
   * Per-transport proxy endpoint configuration carried from the source's
   * `defineApi({ proxyPath })`. Used by the Playground to display the
   * configured proxy URL as read-only metadata. Omitted when the source
   * has no `proxyPath` configured.
   */
  proxyPath?: ProxyPath;
  groups: Record<string, CatalogGroup>;
}

export type Catalog = Record<string, CatalogEntry>;

// ── Aliases (used by explorer, playground, audit views) ─────────────────────

export type EndpointInfo = CatalogEndpoint;
export type GroupInfo = CatalogGroup;
export type SourceInfo = CatalogEntry;
export type SourceMap = Catalog;

// ── Binding snapshot (server-authoritative runtime/source ownership) ───────

export type BindingTransport = "http" | "sse" | "ws";

export type BindingStatusKind = "bound" | "orphan" | "conflict";

export interface BindingStatusRow {
  sourceName: string;
  transport: BindingTransport;
  status: BindingStatusKind;
  /** Owner runtime — present when status === "bound" */
  runtimeId?: string;
  /** All runtimes that claimed this pair — present when status === "conflict" */
  conflicting?: string[];
  /** Canonical HTTP(S) origin of the owning runtime, stamped from listenOrigin */
  appOrigin?: string;
}

/**
 * Wire-format payload for the `binding:snapshot` event.
 *
 * `runtimeCount` and `sourceCount` are server-authoritative so the status bar
 * never aggregates `rows[]` itself (race-prone against partial snapshots):
 * the runtimes connected to Studio, and the sources they host.
 */
export interface BindingSnapshot {
  rows: BindingStatusRow[];
  runtimeCount: number;
  sourceCount: number;
  /** Each runtime connected, and whether it runs in a browser or on a server. */
  /** Each runtime connected, and where it is served when it said so: the page's origin, the app's. */
  runtimes: Array<{ runtimeId: string; kind: "browser" | "server"; origin?: string }>;
  /** When Studio saw the first of the runtimes attached now arrive; absent while none is. */
  activeSince?: number;
  /** When the last runtime left; absent while one is attached, or before any came. */
  idleSince?: number;
}

export interface BindingErrorPayload {
  kind: "conflict";
  details: {
    sourceName: string;
    transport: BindingTransport;
    runtimeIds: string[];
  };
}

// ── Playground model ─────────────────────────────────────────────────────────

/**
 * Accumulated chunk payload for a playground entry. The shape mirrors
 * `packages/studio-core/src/runtime/dispatch-http.ts` and
 * `responder-dispatch.ts` beside it, which emit one
 * of three kinds depending on transport: single `http-result` for HTTP
 * one-shot, repeated `sse-event` for SSE streams, repeated `ws-message`
 * for WS bidirectional channels.
 */
export type PlaygroundChunk =
  | {
      kind: "http-result";
      data?: unknown;
      status: number;
      /** What went wrong, when the call failed; the answer's body stays in `data`. */
      error?: string;
      /** The answer's response headers. */
      headers?: Record<string, string>;
    }
  | { kind: "sse-event"; event: unknown }
  | { kind: "ws-message"; data: unknown }
  /** The channel connected; it delivers nothing to list */
  | { kind: "ws-open" }
  | { kind: "upload-progress"; loaded: number; total: number; percentage: number };

export interface PlaygroundEndSummary {
  /** Runtime-side wall-clock duration from dispatch start to terminal event. */
  durationMs: number;
  /** SSE event count (responder-dispatch.ts). Undefined for HTTP/WS. */
  count?: number;
}

export interface PlaygroundHistoryEntry {
  id: string;
  /**
   * Correlation id for the rid-keyed playground wire. Generated by the UI
   * at entry creation and emitted on `playground:exec`; every
   * `playground:chunk` / `playground:end` / `playground:error` the server
   * sends back carries this rid so the listener routes the response to the
   * originating entry.
   */
  rid: string;
  source: string;
  group: string;
  method: string;
  variables: string;
  headers: string;
  mode: "direct" | "proxy";
  timestamp: number;
  status: "pending" | "success" | "error";
  statusCode?: number | undefined;
  duration?: number | undefined;
  response?: unknown;
  responseHeaders?: Record<string, string> | undefined;
  timing?: RequestTiming | undefined;
  proxyTiming?: ProxyTiming | undefined;
  requestHeaders?: Record<string, string> | undefined;
  /** How much of a form body has been sent, while it uploads */
  upload?: { loaded: number; total: number; percentage: number } | undefined;
  /** Transport used — undefined = HTTP */
  transport?: "sse" | "ws" | undefined;
  /** Streaming lifecycle state */
  streamStatus?: "connecting" | "streaming" | "complete" | "error" | undefined;
  /**
   * Realtime chunks accumulated from `playground:chunk` events. SSE streams
   * append one per yielded event, WS channels append one per incoming
   * message, HTTP one-shot stores its single `http-result` chunk here so
   * the render layer can unwrap it uniformly.
   */
  chunks?: PlaygroundChunk[] | undefined;
  /** How many earlier chunks were let go to keep `chunks` to its last ones */
  chunksDropped?: number | undefined;
}

// ── Timeline filters ────────────────────────────────────────────────────────

export interface TimelineFilters {
  search: string;
  status: RequestStatus[];
  mode: ("direct" | "proxy")[];
  type: ("query" | "mutation")[];
  httpMethod: string[];
  source: string[];
  group: string[];
  minDuration: number | null;
}

// ── Waterfall state ─────────────────────────────────────────────────────────

export type WaterfallSortField = "startTime" | "duration" | "size";
export type WaterfallGroupBy = "none" | "source" | "group";

// ── Settings ────────────────────────────────────────────────────────────────

export type TimestampFormat = "relative" | "absolute";

/** The editor a call site opens in, from the inspector and the Explorer; `off` opens none. */
export type CodeEditor =
  | "vscode"
  | "cursor"
  | "windsurf"
  | "vscodium"
  | "zed"
  | "webstorm"
  | "idea"
  | "off";
export type JsonIndent = 2 | 4;
export type ValidationLib = "zod" | "valibot" | "arktype" | "none";
export type ApisGroupBy = "tag" | "path" | "single";
export type ApisClient = "direct" | "proxy" | "both" | "none";
export type ExportFormat = "har" | "json" | "postman";

export interface Settings {
  // Appearance
  theme: Theme;

  // Recording
  maxRequests: number;
  preserveLog: boolean;
  ignorePatterns: string[];

  // Display
  timestampFormat: TimestampFormat;
  jsonIndent: JsonIndent;

  // Editor
  /** Where a call site of an endpoint opens. */
  codeEditor: CodeEditor;

  // Notifications
  toastOnError: boolean;
  toastOnSlowRequest: boolean;
  slowRequestThreshold: number;
  toastOnFileChange: boolean;

  // Connection
  autoReconnect: boolean;
  reconnectDelay: number;

  // Export
  defaultExportFormat: ExportFormat;

  // Storage
  /** The size of Studio's database, in megabytes, past which the page says so. */
  storageWarnMb: number;

  // Apis defaults
  apisValidation: ValidationLib;
  apisGroupBy: ApisGroupBy;
  apisGenerateTypes: boolean;
  apisGenerateSchemas: boolean;
  apisIncludeComments: boolean;
  apisClient: ApisClient;
}
