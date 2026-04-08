/**
 * Studio hook definitions for streaming transports + WS playground + source HMR.
 *
 * Covers SSE/WS stream lifecycle events, the playground bridge that lets
 * Studio inject messages into live WS connections, and the dev-only HMR
 * hook fired when defineApi() (re-)creates a source.
 */

/** Stream (SSE/WS) lifecycle: open, message, close, error */
export interface StreamHooks {
  onStreamOpen?: (event: {
    requestId: string;
    source: string;
    group: string | undefined;
    method: string;
    transport: "sse" | "ws";
    mode: "direct" | "proxy";
    timestamp: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
  }) => void;

  onStreamMessage?: (event: {
    requestId: string;
    seq: number;
    eventType: string | undefined;
    dataSize: number;
    /** Truncated JSON preview of the event data (max 512 chars) */
    dataPreview?: string;
    timestamp: number;
  }) => void;

  onStreamClose?: (event: {
    requestId: string;
    reason: "complete" | "error" | "disconnect" | "shutdown" | "max_lifetime";
    eventCount: number;
    totalBytes: number;
    duration: number;
    timestamp: number;
  }) => void;

  onStreamError?: (event: { requestId: string; error: string; timestamp: number }) => void;
}

/** WS playground integration — bridges Studio UI to live WS connections */
export interface WSPlaygroundHooks {
  /** Fired when a WS subscription is established — maps requestId to connection */
  onWSTrack?: (event: { requestId: string; connectionId: string; topic: string }) => void;

  /** Fired when a WS connection closes — clears stream tracking */
  onWSUntrack?: (event: { requestId: string }) => void;

  /**
   * Injected by createWSHandler — sends a message to an active WS connection.
   * Used by Studio playground to relay composed messages.
   */
  sendWSMessage?: (connectionId: string, topic: string, data: unknown) => boolean;
}

/** Source registration / HMR hook fired by defineApi() in dev mode */
export interface SourceDefinedHooks {
  /** Dev-only: fired when defineApi() creates or re-creates a source (HMR support) */
  onSourceDefined?: (source: unknown, baseURL: string) => void;
}
