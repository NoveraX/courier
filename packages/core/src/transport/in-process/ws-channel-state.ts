import { createLogger } from "../../logger";
import { checkResponseNow } from "../../realtime/check-response-now";
import type { ChannelHandlers, ConnectionStatus, WSChannelContext } from "../../realtime/types";
import { validateSchema } from "../../validation";
import { holdMessages } from "./held-messages";
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
  /** Hand this channel's client what a peer broadcast, already held to the schema. */
  deliver: (data: unknown) => void;
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
  const early = holdMessages(topic);

  const emitData = (data: unknown): void => {
    if (!early.hold(data)) notify(dataListeners, data, "data");
  };

  /* The first listener takes what was sent before it, in order. */
  function addDataListener(fn: (data: unknown) => void): void {
    dataListeners.add(fn);
    for (const data of early.release()) notify([fn], data, "data");
  }

  const setStatus = (next: ConnectionStatus): void => {
    status = next;
    notify(statusListeners, next, "status");
  };

  /* Held to the response schema as the server holds what it sends. */
  const outbound = (data: unknown): unknown =>
    schema.response ? checkResponseNow(schema.response, data) : data;

  const ended = new AbortController();
  const channelCtx: WSChannelContext = {
    topic,
    variables: variables ?? {},
    connectionId,
    meta: {},
    signal: ended.signal,
    send: (data) => emitData(outbound(data)),
    broadcast: (t, data) => broadcast(t, outbound(data), connectionId),
    close: () => {
      void close();
    },
  };

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    early.release();
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
    on(event: "data" | "status" | "error", handler: (arg: never) => void) {
      /* Refusals reach an in-process caller as the rejection of its `send`,
         so there is nothing to hear here. */
      if (event === "error") return () => false;
      if (event === "data") {
        addDataListener(handler as (data: unknown) => void);
        return () => dataListeners.delete(handler as (data: unknown) => void);
      }
      statusListeners.add(handler as (s: ConnectionStatus) => void);
      // Emit current status immediately so late subscribers see "connected".
      notify([handler as (s: ConnectionStatus) => void], status, "status");
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
    deliver: emitData,
    markConnected: () => setStatus("connected"),
    close,
  };
}

/* One failing listener must not keep the message from the others. */
function notify<TValue>(
  listeners: Iterable<(value: TValue) => void>,
  value: TValue,
  kind: "data" | "status",
): void {
  for (const fn of listeners) {
    try {
      fn(value);
    } catch (error) {
      log.error(`A channel ${kind} listener failed`, error);
    }
  }
}
