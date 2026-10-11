import { createLogger, isConfigurationError } from "@noverax/courier";
import type { ConnectionStatus, WSChannel } from "@noverax/courier/realtime";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

import type { ChannelError, ChannelResult, CourierChannelOptions } from "../types";
import { useEffectEvent } from "./effect-event";
import { useKeyedStatus } from "./keyed-status";
import { streamKeyOf } from "./stream-key";

const log = createLogger("React");

/** A group hook's options, as `useChannel` takes them untyped. */
export type UseChannelOptions<TReceive> = CourierChannelOptions<TReceive, unknown>;

/** Internal factory type — creates WSChannel from group+method+variables */
export type ChannelFn = (
  group: string,
  method: string,
  variables?: unknown,
) => WSChannel<unknown, unknown>;

/** What one channel has delivered; `key` names the channel it belongs to. */
interface ChannelState<TReceive> {
  key: string;
  lastMessage: TReceive | undefined;
  error: ChannelError | undefined;
}

/**
 * Subscribe to a bidirectional WebSocket channel with automatic lifecycle management.
 *
 * A change of method or variables joins another channel, and `lastMessage`,
 * `error` and the status — `connecting` — start over with it in the same
 * render. Messages sent before the channel exists — from a mount effect, say —
 * wait for it and go out once it does; one sent while no channel is on its
 * way is dropped with a warning, and `send` answers `false`.
 *
 * @param channel - Factory that creates a WSChannel (injected by createGroupHooks)
 * @param group - API group name
 * @param method - Endpoint method name
 * @param options - Channel configuration
 * @returns Reactive channel state with send capability
 * @example
 * const { send, lastMessage } = useChannel(channelFn, "chat", "room", { variables: { room: "a" } });
 */
export function useChannel<TSend, TReceive>(
  channel: ChannelFn,
  group: string,
  method: string,
  options?: UseChannelOptions<TReceive>,
): ChannelResult<TSend, TReceive> {
  const { variables, enabled = true, onData, onError, onStatusChange } = options ?? {};
  const { key, variablesKey } = streamKeyOf(group, method, variables);

  const [state, setState] = React.useState<ChannelState<TReceive>>(() => emptyChannel(key));
  const current = state.key === key ? state : emptyChannel<TReceive>(key);
  if (current !== state) setState(current);
  const [status, reportStatus] = useKeyedStatus(key, enabled);

  /* Called as the channel speaks, with what the component last rendered: a new
     handler applies without reconnecting. */
  const handleData = useEffectEvent((message: TReceive) => onData?.(message));
  const handleError = useEffectEvent((error: ChannelError) => onError?.(error));
  const handleStatus = useEffectEvent((next: ConnectionStatus) => onStatusChange?.(next));

  const channelRef = React.useRef<WSChannel<unknown, unknown> | null>(null);
  /** Messages sent while the channel is on its way; null when none is coming. */
  const pendingRef = React.useRef<TSend[] | null>(null);

  const send = React.useCallback(
    (data: TSend): boolean => {
      if (channelRef.current) return channelRef.current.send(data);
      if (pendingRef.current) {
        pendingRef.current.push(data);
        return true;
      }
      log.warn(`useChannel("${group}.${method}") is not open; the message was dropped`);
      return false;
    },
    [group, method],
  );

  const close = React.useCallback(() => {
    pendingRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    const vars = variablesKey ? (JSON.parse(variablesKey) as unknown) : undefined;
    const pending: TSend[] = [];
    pendingRef.current = pending;
    let active = true;
    let ch: WSChannel<unknown, unknown> | null = null;
    const unsubscribe: (() => void)[] = [];

    const fail = (error: ChannelError) => {
      if (!active) return;
      setState((prev) => (prev.key === key ? { ...prev, error } : prev));
      handleError(error);
    };
    const report = (next: ConnectionStatus) => {
      reportStatus({ key, status: next });
      if (next === "connected") {
        setState((prev) => (prev.key === key ? { ...prev, error: undefined } : prev));
      }
      handleStatus(next);
    };

    // Defer the actual channel creation to a microtask so React 19 StrictMode
    // (dev-mode mount → cleanup → mount) tears down the first effect before
    // any network I/O fires. Without this, StrictMode produces two real WS
    // connections and two duplicate Studio Timeline entries.
    queueMicrotask(() => {
      if (!active) return;
      try {
        ch = channel(group, method, vars);
      } catch (error) {
        if (!isConfigurationError(error)) throw error;
        pendingRef.current = null;
        fail(error);
        report("disconnected");
        return;
      }
      channelRef.current = ch;
      pendingRef.current = null;

      unsubscribe.push(
        ch.on("status", report),
        ch.on("data", (message: unknown) => {
          const typed = message as TReceive;
          setState((prev) => (prev.key === key ? { ...prev, lastMessage: typed } : prev));
          handleData(typed);
        }),
        /* The channel's own error event: a message the server refused, a
           handler that failed, or the channel ending with a reason. */
        ch.on("error", fail),
      );
      for (const message of pending) ch.send(message);
    });

    return () => {
      active = false;
      for (const off of unsubscribe) off();
      ch?.close();
      if (pendingRef.current === pending) pendingRef.current = null;
      if (channelRef.current === ch) channelRef.current = null;
      reportStatus(undefined);
    };
  }, [enabled, group, method, key, variablesKey, channel, reportStatus]);

  return { lastMessage: current.lastMessage, status, error: current.error, send, close };
}

function emptyChannel<TReceive>(key: string): ChannelState<TReceive> {
  return { key, lastMessage: undefined, error: undefined };
}
