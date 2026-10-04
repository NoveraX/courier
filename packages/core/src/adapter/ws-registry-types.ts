import type { WSMessage } from "../realtime/ws/ws-protocol";
import type { ServerTopicManager } from "./ws-topics";

/** Read-only connection info exposed via public API */
export interface ConnectionInfo {
  readonly connectionId: string;
  readonly meta: Record<string, unknown>;
  readonly connectedAt: number;
  readonly topicCount: number;
}

/** Public API for managing active WebSocket connections */
export interface ConnectionRegistry {
  /** Number of active connections */
  readonly count: number;
  /** Get connection info by ID */
  get(connectionId: string): ConnectionInfo | undefined;
  /** Check if a connection exists */
  has(connectionId: string): boolean;
  /** List all active connections */
  list(): ConnectionInfo[];
  /** Filter connections by metadata predicate */
  getByMeta(predicate: (meta: Record<string, unknown>) => boolean): ConnectionInfo[];
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
  /** Force-disconnect a connection */
  disconnect(connectionId: string, code?: number, reason?: string): void;
  /** Disconnect all connections matching a metadata predicate (e.g. ban a user) */
  disconnectByMeta(
    predicate: (meta: Record<string, unknown>) => boolean,
    code?: number,
    reason?: string,
  ): void;
}

/** Internal entry stored per connection */
export interface RegistryEntry {
  connectionId: string;
  meta: Record<string, unknown>;
  connectedAt: number;
  sendRaw: (msg: WSMessage) => void;
  /** Send pre-encoded JSON string — avoids redundant JSON.stringify on broadcast */
  sendEncoded: (encoded: string) => void;
  close: (code?: number, reason?: string) => void;
  /** When a token asked for with `auth_required` must have come in by */
  authDeadline?: ReturnType<typeof setTimeout> | undefined;
}

/** @internal Registry with add/remove methods for handler integration */
export interface InternalConnectionRegistry extends ConnectionRegistry {
  add(entry: RegistryEntry): void;
  remove(connectionId: string): void;
  /** Update connection metadata (e.g. after token refresh) */
  updateMeta(connectionId: string, meta: Record<string, unknown>): void;
  /** Get raw entry (internal — for token refresh handler) */
  getEntry(connectionId: string): RegistryEntry | undefined;
  /** Inject topic manager after creation (breaks circular init dependency) */
  setTopicManager(tm: ServerTopicManager): void;
}
