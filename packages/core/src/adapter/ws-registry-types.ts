import type { LoggedPosition } from "../realtime/adapters";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import type { Selection } from "./connection-selector";
import type { TopicPosition } from "./ws-topic-sequences";
import type { ServerTopicManager } from "./ws-topics";

/** Read-only connection info exposed via public API */
export interface ConnectionInfo {
  readonly connectionId: string;
  /** A copy of its metadata: what `onConnect` gave as it was let in, or the last `onReauth` renewed */
  readonly meta: Record<string, unknown>;
  readonly connectedAt: number;
  readonly topicCount: number;
}

/** What a metadata field of a selector is compared to. */
export type MetaValue = string | number | boolean;

/**
 * Which connections an operation concerns: one by its id, several by
 * theirs — at most 1000 — or each whose metadata has every field given —
 * 1 to 16 — equal to its value, a string, a finite number or a boolean.
 * The metadata compared is what `onConnect` gave as the connection was let
 * in, or the last `onReauth` renewed: a change to `ctx.meta` after that is
 * not seen.
 *
 * @example
 * ```ts
 * await connections.disconnect({ meta: { userId: "u1" } }, { code: 4003, reason: "Banned" });
 * ```
 */
export type ConnectionSelector =
  | string
  | { readonly id: string | readonly string[] }
  | { readonly meta: Readonly<Record<string, MetaValue>> };

/** How the connections the application closes are told why. */
export interface DisconnectOptions {
  /** A code a socket can send: 1000–1014 but 1004–1006, or 3000–4999. Default 1000 */
  code?: number | undefined;
  /** Why, as the client reads it, cut to the 123 bytes a close carries. Default "Disconnected by server" */
  reason?: string | undefined;
}

/** How long connections asked for their credentials again have to send them. */
export interface RequireAuthOptions {
  /** Milliseconds; the handler's `authRequiredTimeoutMs` when not given, 0 for no deadline */
  timeoutMs?: number | undefined;
}

/** Public API for managing active WebSocket connections */
export interface ConnectionRegistry {
  /** Number of active connections */
  readonly count: number;
  /** Get connection info by ID */
  get(connectionId: string): ConnectionInfo | undefined;
  /** Check if a connection exists */
  has(connectionId: string): boolean;
  /**
   * This replica's connections: every one, or those `selector` names.
   * @throws TypeError for a selector that names no connection
   */
  list(selector?: ConnectionSelector): ConnectionInfo[];
  /** Send a data message to a specific connection */
  send(connectionId: string, data: unknown): void;
  /** Broadcast a data message to all connections (optionally exclude one). Yields to event loop for large audiences. */
  broadcast(data: unknown, exclude?: string): Promise<void>;
  /** Broadcast to all connections subscribed to a topic. Yields to event loop for large audiences. */
  broadcastToTopic(topic: string, data: unknown, exclude?: string): Promise<void>;
  /** Broadcast to all qualified topics matching a base topic (e.g. "api.chat.room" matches 'api.chat.room#{"room":"a"}'). Yields to event loop for large audiences. */
  broadcastToBaseTopic(baseTopic: string, data: unknown, exclude?: string): Promise<void>;
  /** Send a data message to a specific connection with topic context */
  sendToConnection(connectionId: string, topic: string, data: unknown): void;
  /**
   * Close the connections `selector` names, with `code` and `reason` — on
   * every replica that shares the handler's pub/sub adapter. Resolves once
   * this replica's are closed and the command for the others has gone to
   * the adapter; rejects with a `TypeError`, closing none, for a selector
   * that names no connection or a code no socket can send.
   */
  disconnect(selector: ConnectionSelector, options?: DisconnectOptions): Promise<void>;
  /**
   * Ask the connections `selector` names — on every replica — for their
   * credentials again: each sends them, asked for anew, and unless
   * `onReauth` takes them within `timeoutMs` it is closed with 4401.
   * Resolves and rejects as `disconnect` does, a `TypeError` for a
   * deadline no timer keeps too.
   */
  requireAuth(selector: ConnectionSelector, options?: RequireAuthOptions): Promise<void>;
}

/** Internal entry stored per connection */
export interface RegistryEntry {
  connectionId: string;
  /** Its metadata, a frozen copy once the registry holds it: what a selector compares */
  meta: Record<string, unknown>;
  connectedAt: number;
  sendRaw: (msg: WSMessage) => void;
  /** Send pre-encoded JSON string — avoids redundant JSON.stringify on broadcast */
  sendEncoded: (encoded: string) => void;
  /**
   * Send a frame of a topic's sequence — an event, a `skip`, a `resync` —
   * with the position it brings the count to: while the connection's
   * subscription to the topic resumes from a log, one the resumption sends
   * itself is dropped, and the others are held until it has
   */
  sendTopicEvent: (topic: string, position: TopicPosition, encoded: string) => void;
  /** Close the connection as the application asked, with an application's code */
  close: (code: number, reason: string) => void;
  /**
   * Ask for its credentials again, within `timeoutMs` — the handler's
   * `authRequiredTimeoutMs` when not given, 0 for no deadline
   * @returns The function that lifts the deadline
   */
  requireAuth: (timeoutMs?: number) => () => void;
  /** Close it, given up for a newer connection of its key */
  evict: () => void;
}

/** @internal Registry with add/remove methods for handler integration */
export interface InternalConnectionRegistry extends ConnectionRegistry {
  add(entry: RegistryEntry): void;
  remove(connectionId: string): void;
  /** Renew a connection's metadata after `onReauth`: a copy of it is what selectors compare from now on */
  updateMeta(connectionId: string, meta: Record<string, unknown>): void;
  /** Get raw entry (internal — for token refresh handler) */
  getEntry(connectionId: string): RegistryEntry | undefined;
  /** This replica's entries a selection names, each once */
  select(selection: Selection): RegistryEntry[];
  /** Close the connections a limit gave up for newer ones, wherever they are held */
  evict(connectionIds: readonly string[]): Promise<void>;
  /** Inject topic manager after creation (breaks circular init dependency) */
  setTopicManager(tm: ServerTopicManager): void;
  /** Where a topic's sequence stands on this replica: what `subscribed` states */
  positionOf(topic: string): TopicPosition;
  /** A topic no subscriber holds any more: its sequence and its history are let go of */
  forgetTopic(topic: string): void;
  /**
   * The frames of the events a subscription missed since the position it
   * sent, or undefined when they cannot all be sent: another epoch, no
   * history, a position the history no longer reaches, or none at all
   */
  eventsAfter(topic: string, since: unknown): readonly string[] | undefined;
  /**
   * The pub/sub adapter is back from an outage, which may have cost events:
   * with a log, each topic is caught up from it; without, or for a topic
   * the log cannot catch up, the subscriptions are told `resync`
   */
  catchUp(): Promise<void>;
  /** Deliver an event a log numbered to this replica's subscribers of its topic, in the order of its number */
  deliverLogged(topic: string, payload: unknown, logged: LoggedPosition): void;
  /** Whether this replica counts a topic's sequence: a subscriber holds it, or an event of it came */
  follows(topic: string): boolean;
  /** Count a topic's sequence from where a log's stands, unless this replica counts it already */
  follow(topic: string, position: TopicPosition): void;
}
