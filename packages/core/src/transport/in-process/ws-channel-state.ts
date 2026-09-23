import { createLogger } from "../../logger";
import type { ChannelHandlers, ConnectionStatus, WSChannelContext } from "../../realtime/types";
import { validateSchema } from "../../validation";
import { type InProcessStreamSchema, wrapStreamError } from "./shared";
import type { InProcessWSChannel } from "./types";

const log = createLogger("WS");

const EXECUTOR = "executeDirectWSChannel";

/**
 * Per-channel runtime state machine for an in-process WS channel.
 *
 * Owns: listener pools, status, close idempotency, fan-out helpers.
 * Decoupled from resolution/middleware so the executor stays focused on
 * orchestration.
 */
export interface ChannelState {
  /** Build the WSChannelContext object the server handlers receive. */
  channelCtx: WSChannelContext;
  /** Build the WSChannel object exposed to the playground client. */
  client: InProcessWSChannel;
  /** Mark the channel as connected (fires status listeners). */
  markConnected: () => void;
  /** Close the channel idempotently — runs onLeave + status disconnected. */
  close: () => Promise<void>;
}

export interface ChannelStateInit {
  topic: string;
  variables: Record<string, unknown> | undefined;
  connectionId: string;
  schema: InProcessStreamSchema;
  handlers: ChannelHandlers;
  broadcast: (topic: string, data: unknown, excludeConnectionId?: string) => void;
  unsubscribeFromRegistry: () => void;
}

/** Construct a fresh channel state machine. */
export function createChannelState(init: ChannelStateInit): ChannelState {
  const { topic, variables, connectionId, schema, handlers, broadcast, unsubscribeFromRegistry } =
    init;

  const dataListeners = new Set<(data: unknown) => void>();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connecting";
  let closed = false;

  const emitData = (data: unknown): void => {
    for (const fn of dataListeners) {
      try {
        fn(data);
      } catch (error) {
        /* One failing listener must not keep the message from the others. */
        log.error("A channel data listener failed", error);
      }
    }
  };

  const setStatus = (next: ConnectionStatus): void => {
    status = next;
    for (const fn of statusListeners) {
      try {
        fn(next);
      } catch (error) {
        log.error("A channel status listener failed", error);
      }
    }
  };

  const ended = new AbortController();
  const channelCtx: WSChannelContext = {
    topic,
    variables: variables ?? {},
    connectionId,
    meta: {},
    signal: ended.signal,
    send: (data) => emitData(data),
    broadcast: (t, data) => broadcast(t, data, connectionId),
    close: () => {
      void close();
    },
  };

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    ended.abort();
    unsubscribeFromRegistry();
    try {
      await handlers.onLeave?.(channelCtx);
    } catch (error) {
      /* Isolated so it cannot block the status change, but not hidden. */
      log.warn("onLeave handler failed", error);
    }
    setStatus("disconnected");
  }

  const client: InProcessWSChannel = {
    async send(data) {
      if (closed) return;
      // Validate inbound (client→server) message against `schema.receive`.
      // Mirrors canonical ws-message validation.
      const validated = schema.receive
        ? await validateSchema(
            schema.receive as Parameters<typeof validateSchema>[0],
            data,
            "receive",
          )
        : data;
      try {
        await handlers.onMessage(channelCtx, validated);
      } catch (error) {
        throw wrapStreamError(EXECUTOR, "onMessage failed", error);
      }
    },
    on(event: "data" | "status", handler: (arg: never) => void) {
      if (event === "data") {
        dataListeners.add(handler as (data: unknown) => void);
        return () => dataListeners.delete(handler as (data: unknown) => void);
      }
      statusListeners.add(handler as (s: ConnectionStatus) => void);
      // Emit current status immediately so late subscribers see "connected".
      try {
        (handler as (s: ConnectionStatus) => void)(status);
      } catch (error) {
        log.error("A channel status listener failed", error);
      }
      return () => statusListeners.delete(handler as (s: ConnectionStatus) => void);
    },
    close() {
      void close();
    },
    get status() {
      return status;
    },
  } as InProcessWSChannel;

  return {
    channelCtx,
    client,
    markConnected: () => setStatus("connected"),
    close,
  };
}
