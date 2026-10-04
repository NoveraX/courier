import { createLogger } from "../../logger";
import { checkResponseNow } from "../../realtime/check-response-now";
import { OBSERVE_DATA } from "../../realtime/observe-data";
import type { ChannelHandlers, ConnectionStatus, WSChannelContext } from "../../realtime/types";
import { holdMessages } from "./held-messages";
import { notifyListeners } from "./notify-listeners";
import { receiveClientMessage } from "./receive-client-message";
import type { InProcessStreamSchema } from "./shared";
import type { InProcessWSChannel } from "./types";

const log = createLogger("WS");

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
  variables: unknown;
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
  const observers = new Set<(data: unknown) => void>();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connecting";
  let closed = false;
  const early = holdMessages(topic);

  const emitData = (data: unknown): void => {
    notifyListeners(observers, data, "data");
    if (!early.hold(data)) notifyListeners(dataListeners, data, "data");
  };

  /* The first listener takes what was sent before it, in order. */
  function addDataListener(fn: (data: unknown) => void): void {
    dataListeners.add(fn);
    for (const data of early.release()) notifyListeners([fn], data, "data");
  }

  /* An observer hears what is held too, and leaves it held for that listener. */
  function addObserver(fn: (data: unknown) => void): () => void {
    observers.add(fn);
    for (const data of early.peek()) notifyListeners([fn], data, "data");
    return () => observers.delete(fn);
  }

  const setStatus = (next: ConnectionStatus): void => {
    status = next;
    notifyListeners(statusListeners, next, "status");
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
    send: (data) =>
      receiveClientMessage({ topic, schema, handlers, channelCtx, isClosed: () => closed }, data),
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
      notifyListeners([handler as (s: ConnectionStatus) => void], status, "status");
      return () => statusListeners.delete(handler as (s: ConnectionStatus) => void);
    },
    close() {
      void close();
    },
    [OBSERVE_DATA]: addObserver,
    /* Ended for its caller once closed: `disconnected` is heard after
       `onLeave` has run, but nothing sent meanwhile reaches the handler. */
    get status() {
      return closed ? "disconnected" : status;
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
