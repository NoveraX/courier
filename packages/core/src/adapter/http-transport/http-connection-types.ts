import type { WebSocketLike } from "../../realtime/adapters";
import type { Delivery, DeliveryKind } from "./http-delivery";

/** A connection over HTTP: a socket to its handler, and what the transport's requests do to it. */
export interface HTTPConnection extends WebSocketLike {
  readonly token: string;
  /** The answer it delivers its frames on now, if one is held */
  readonly delivering: DeliveryKind | undefined;
  /** Whether it holds a poll that waits for a frame */
  readonly holding: boolean;
  /**
   * Answer a `stream` or a `poll`, in place of the answer held before: it
   * carries every frame after `ack`, the first answer the connection's
   * token before them. A poll with nothing to carry is held `holdMs` at most,
   * the transport's own wait unless given.
   */
  deliver(kind: DeliveryKind, ack: number, holdMs?: number): Delivery;
  /** Take the client's frames, the first numbered `seq`; false when some before it are missing */
  receive(seq: number, frames: readonly string[]): boolean;
  /** The client has taken every frame up to `ack` */
  acknowledge(ack: number): void;
  /** A request carried the connection's token: its client has it, and is there */
  presented(): void;
  /** The client closed the connection, with `code` */
  peerClose(code: number): void;
  /** End it now, its client told nothing more: its handler has stopped */
  end(): void;
}

/** What a transport's connections count together, since its handler was made. */
export interface HTTPCounts {
  /** Frames sent again: an answer that carried them was lost, or ended before its client took them */
  resent: number;
  /** Streams ended after `streamMs`, so their clients asked for the next */
  rotated: number;
}
