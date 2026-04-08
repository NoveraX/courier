"use client";

import type { ConnectionStatus, WSChannel } from "@noverax/nexus/realtime";
import { useCallback, useEffect, useRef, useState } from "react";

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
  /** Called when a connection error occurs */
  onError?: (error: Error) => void;
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

  const [lastMessage, setLastMessage] = useState<TReceive | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | undefined>(undefined);

  // Stable refs for callbacks — avoids re-connecting on handler identity change
  const callbacksRef = useRef({ onData, onError, onStatusChange });
  callbacksRef.current = { onData, onError, onStatusChange };

  const channelRef = useRef<WSChannel<unknown, unknown> | null>(null);

  const send = useCallback((data: TSend) => {
    channelRef.current?.send(data);
  }, []);

  const close = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
  }, []);

  // Serialize variables for stable dependency tracking
  const variablesKey = JSON.stringify(variables);

  useEffect(() => {
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
        if ((message as Record<string, unknown>)?.type === "error") {
          const err = new Error(
            String((message as Record<string, unknown>)?.message ?? "Channel error"),
          );
          setError(err);
          callbacksRef.current.onError?.(err);
          return;
        }
        const typed = message as TReceive;
        setLastMessage(typed);
        callbacksRef.current.onData?.(typed);
      });
    });

    return () => {
      cancelled = true;
      unsubStatus?.();
      unsubData?.();
      ch?.close();
      if (channelRef.current === ch) {
        channelRef.current = null;
      }
    };
  }, [enabled, group, method, variablesKey, channel]);

  return { lastMessage, status, error, send, close };
}
