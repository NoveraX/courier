import type { ConnectionStatus, RealtimeError, WSChannel } from "@noverax/courier/realtime";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

import type { ChannelResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseChannelOptions<TReceive> {
  /** Variables passed to the WS channel endpoint */
  variables?: unknown;
  /** Disable the channel (default: true) */
  enabled?: boolean;
  /** Called on each incoming message from the server */
  onData?: (message: TReceive) => void;
  /**
   * Called when the server refuses a message, a handler fails, or the
   * channel ends with a reason — with the `RealtimeError`, whose `code`
   * tells them apart (4403 forbidden, 4422 invalid, …)
   */
  onError?: (error: RealtimeError) => void;
  /** Called on connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
}

/** Internal factory type — creates WSChannel from group+method+variables */
export type ChannelFn = (
  group: string,
  method: string,
  variables?: unknown,
) => WSChannel<unknown, unknown>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a bidirectional WebSocket channel with automatic lifecycle management.
 *
 * @param channel - Factory that creates a WSChannel (injected by createGroupHooks)
 * @param group - API group name
 * @param method - Endpoint method name
 * @param options - Channel configuration
 * @returns Reactive channel state with send capability
 */
export function useChannel<TSend, TReceive>(
  channel: ChannelFn,
  group: string,
  method: string,
  options?: UseChannelOptions<TReceive>,
): ChannelResult<TSend, TReceive> {
  const { variables, enabled = true, onData, onError, onStatusChange } = options ?? {};

  const [lastMessage, setLastMessage] = React.useState<TReceive | undefined>(undefined);
  const [status, setStatus] = React.useState<ConnectionStatus>("disconnected");
  const [error, setError] = React.useState<RealtimeError | undefined>(undefined);

  // Stable refs for callbacks — avoids re-connecting on handler identity change
  const callbacksRef = React.useRef({ onData, onError, onStatusChange });
  callbacksRef.current = { onData, onError, onStatusChange };

  const channelRef = React.useRef<WSChannel<unknown, unknown> | null>(null);

  const send = React.useCallback((data: TSend) => {
    channelRef.current?.send(data);
  }, []);

  const close = React.useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
  }, []);

  // Serialize variables for stable dependency tracking
  const variablesKey = JSON.stringify(variables);

  React.useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    const vars = variablesKey ? (JSON.parse(variablesKey) as unknown) : undefined;

    // Defer the actual channel creation to a microtask so React 19 StrictMode
    // (dev-mode mount → cleanup → mount) tears down the first effect before
    // any network I/O fires. Without this, StrictMode produces two real WS
    // connections and two duplicate Studio Timeline entries.
    let cancelled = false;
    let ch: WSChannel<unknown, unknown> | null = null;
    let unsubStatus: (() => void) | undefined;
    let unsubData: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    queueMicrotask(() => {
      if (cancelled) return;
      ch = channel(group, method, vars);
      channelRef.current = ch;

      unsubStatus = ch.on("status", (s: ConnectionStatus) => {
        setStatus(s);
        if (s === "connected") setError(undefined);
        callbacksRef.current.onStatusChange?.(s);
      });

      unsubData = ch.on("data", (message: unknown) => {
        const typed = message as TReceive;
        setLastMessage(typed);
        callbacksRef.current.onData?.(typed);
      });

      /* The channel's own error event: a message the server refused, a
         handler that failed, or the channel ending with a reason. A payload
         shaped `{ type: "error" }` used to be taken for one — an app's own
         data swallowed — while real errors never arrived at all. */
      unsubError = ch.on("error", (error: RealtimeError) => {
        setError(error);
        callbacksRef.current.onError?.(error);
      });
    });

    return () => {
      cancelled = true;
      unsubStatus?.();
      unsubData?.();
      unsubError?.();
      ch?.close();
      if (channelRef.current === ch) {
        channelRef.current = null;
      }
    };
  }, [enabled, group, method, variablesKey, channel]);

  return { lastMessage, status, error, send, close };
}
