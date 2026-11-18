import type { PlatformFetch } from "../../http-client/source-transport";
import type { WSTransport } from "../ws/connection-machine-types";
import type { HTTPFallbackCause } from "../ws/http-protocol";
import type { WSClientSocket } from "../ws/ws-types";

/** How the server's frames come: on a stream held open, or on polls. */
export type HTTPMode = Exclude<WSTransport, "websocket">;

/** What a socket over HTTP is made with. */
export interface HTTPSocketOptions {
  /** The source's `fetch`, else the platform's */
  readonly fetch?: PlatformFetch | undefined;
  /** What every request is made with besides its method, headers, body and signal */
  readonly init?: RequestInit | undefined;
  /** Headers of the request that opens the connection: the handshake's, where a script may set them */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** How the server's frames come first */
  readonly mode: HTTPMode;
  /** How long a stream's first bytes may take before polls carry the frames instead */
  readonly probeMs: number;
  /** Why the client is on HTTP, which the request that opens the connection tells the server */
  readonly cause?: HTTPFallbackCause | undefined;
}

/** A WebSocket connection carried over HTTP requests, as the client drives a socket. */
export interface HTTPSocket extends WSClientSocket {
  /** How the server's frames come now */
  readonly mode: HTTPMode;
  /** Told when they come another way from then on: a stream held back, so polls */
  onmode: ((mode: HTTPMode) => void) | null;
  /**
   * Whether the server answered the request that opens the connection:
   * until it does, the socket is open only to carry the client's first
   * frames with that request
   */
  readonly reached: boolean;
}
