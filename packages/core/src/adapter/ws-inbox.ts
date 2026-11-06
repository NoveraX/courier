import type { WebSocketLike } from "../realtime/adapters";

/** How much a socket may send before its connection is admitted. */
export interface HeldLimits {
  /** Frames, its `auth` among them */
  readonly frames: number;
  /** Their characters together */
  readonly size: number;
  /** One frame's characters: a larger one is never taken in */
  readonly frameSize: number;
}

/** What a socket let go of had held. */
export interface HeldCount {
  readonly frames: number;
  readonly size: number;
}

/** The frames a socket sends, held until its connection is admitted. */
export interface WSInbox {
  /**
   * The first frame the socket sends, left held; `undefined` when `ms` pass
   * without one, or the socket closes first.
   */
  first(ms: number): Promise<string | undefined>;
  /** Let go of the first frame held: the connection took it as its credentials. */
  takeFirst(): void;
  /**
   * Hand every frame held to `route`, in the order they came, then each
   * frame as it comes.
   */
  open(route: (raw: string) => void): void;
}

/**
 * Listen to a socket from the moment it is admitted, holding what it sends
 * until its connection is: a client proves who it is and subscribes as soon
 * as its socket opens, and a subscription sent while `onConnect` ran was
 * lost, leaving the client connected to nothing. What it holds is bounded
 * twice, by frames and by their size: a socket that sends more frames than
 * it may before then, or more characters, or one frame larger than a message
 * may be — which is not even read as text — is let go of. Nothing more it
 * sends is kept, and `onOverflow` is told what it held, to close it.
 *
 * @param ws - The admitted socket
 * @param limits - How many frames, and how much, it may send before its connection is admitted
 * @param onOverflow - Told of a socket closed for sending more
 * @returns The inbox, opened once the connection is
 * @example
 * ```ts
 * const inbox = holdFrames(ws, { frames: 200, size: 262_144, frameSize: 65_536 }, (held) => close(held));
 * const first = await inbox.first(3000);
 * inbox.open((raw) => routeMessage(ctx, raw, heartbeat));
 * ```
 */
export function holdFrames(
  ws: WebSocketLike,
  limits: HeldLimits,
  onOverflow: (held: HeldCount) => void,
): WSInbox {
  let held: string[] | undefined = [];
  let size = 0;
  let route: ((raw: string) => void) | undefined;
  let awaitingFirst: ((raw: string | undefined) => void) | undefined;
  ws.addEventListener("message", (event) => {
    if (route !== undefined) route(textOf(event.data));
    else hold(event.data);
  });
  ws.addEventListener("close", () => awaitingFirst?.(undefined));

  function hold(data: unknown): void {
    if (held === undefined) return;
    const raw = sizeOf(data) > limits.frameSize ? undefined : textOf(data);
    if (raw === undefined || held.length >= limits.frames || size + raw.length > limits.size) {
      const count = { frames: held.length, size };
      held = undefined;
      onOverflow(count);
      return;
    }
    held.push(raw);
    size += raw.length;
    if (held.length === 1) awaitingFirst?.(raw);
  }

  return {
    first(ms) {
      const [already] = held ?? [];
      if (already !== undefined) return Promise.resolve(already);
      return new Promise((resolve) => {
        const timer = setTimeout(() => awaitingFirst?.(undefined), ms);
        awaitingFirst = (raw) => {
          awaitingFirst = undefined;
          clearTimeout(timer);
          resolve(raw);
        };
      });
    },
    takeFirst() {
      size -= held?.shift()?.length ?? 0;
    },
    open(next) {
      const waiting = held ?? [];
      held = undefined;
      route = next;
      for (const raw of waiting) next(raw);
    },
  };
}

function textOf(data: unknown): string {
  return typeof data === "string" ? data : String(data);
}

/* A frame's size before it is read as text: its characters, or the bytes of one that came binary. */
function sizeOf(data: unknown): number {
  if (typeof data === "string") return data.length;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return data.byteLength;
  return textOf(data).length;
}
