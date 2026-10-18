import type { ScopedLogger } from "../../logger";
import type { ConnectionState } from "../connection-state";
import type { ConnectionRetry } from "../retry-of";
import type { createMessageQueue } from "./message-queue";
import type { ServerSilenceDetector } from "./server-silence";
import type { TopicRegistry } from "./topic-registry-types";
import type { WSAuthFrame } from "./ws-credentials";
import type { WSClientSocket, WSConnectionConfig, WSSocketFactory } from "./ws-types";

/**
 * Mutable per-connection state shared between lifecycle handlers.
 *
 * Encapsulating it as an object lets the open/message/close handlers live
 * in their own module while keeping the original closure semantics intact.
 * `ws` and `attempt` are reassigned across reconnect cycles, so they
 * cannot be passed by value.
 */
export interface LifecycleContext {
  config: WSConnectionConfig;
  state: ConnectionState;
  log: ScopedLogger;
  topics: TopicRegistry;
  queue: ReturnType<typeof createMessageQueue>;
  silence: ServerSilenceDetector;
  factory: WSSocketFactory;
  sendRaw(data: string): boolean;
  /** Send the socket's credentials again, asked for anew */
  authenticate(): void;
  /** Mutable refs — handlers reassign these */
  refs: {
    ws: WSClientSocket | null;
    /** The frame the open socket proves who it is with */
    frame: WSAuthFrame | undefined;
    attempt: number;
    closed: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    /** What the socket now open has done, and why the connection last reconnected */
    trail: SocketTrail;
  };
}

/** What the connection keeps of its sockets to tell why it reconnects. */
export interface SocketTrail {
  /** Connections in a row that ended before the server sent anything */
  failures: number;
  /** Whether the socket now open has opened, and whether the server has sent anything on it */
  opened: boolean;
  received: boolean;
  /** What the socket's error event carried, before it closed */
  error: unknown;
  retry: ConnectionRetry | undefined;
}
