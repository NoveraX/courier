import type { PlatformFetch } from "../../http-client/source-transport";
import type { HTTPSocket, HTTPSocketOptions } from "../ws-http/http-socket-types";
import type { WSTransport } from "./connection-machine-types";
import type { RungMemory } from "./rung-memory";
import type { WSClientSocket, WSSocketFactory } from "./ws-types";

/** A socket of the transport ladder: it says what carries it, and when that changes. */
export interface LadderSocket extends WSClientSocket {
  readonly transport: WSTransport;
  /**
   * Whether its server was reached on the transport that carries it now:
   * its WebSocket opened, or the request that opens the connection over
   * HTTP was answered
   */
  readonly reached: boolean;
  /** Told when its frames travel another way from then on: a stream held back, so polls */
  ontransport: ((transport: WSTransport) => void) | null;
}

/** What the ladder climbs down with. */
export interface LadderOptions {
  /** Opens the WebSocket: the platform's, or the source's class */
  readonly webSocket: WSSocketFactory;
  /** How long a WebSocket may go unanswered, and a stream without its first bytes, in ms */
  readonly afterMs: number;
  readonly memory: RungMemory;
  /** The source's `fetch`, and what its requests are made with */
  readonly fetch?: PlatformFetch | undefined;
  readonly init?: RequestInit | undefined;
  /** Loads the HTTP transport, which a page that never needs it never loads */
  readonly load: () => Promise<(url: string, options: HTTPSocketOptions) => HTTPSocket>;
}
