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

/** What a socket let go of had sent: its `auth` among it. */
export interface HeldCount {
  readonly frames: number;
  readonly size: number;
}

/** The frames a socket sends, held until its connection is admitted. */
export interface WSInbox {
  /**
   * Read the first frame the socket sends with `read`, as it comes and
   * before any frame after it is taken in — whatever follows it in the same
   * read of the socket, its own answer comes first. It counts among what
   * the socket may send, and is not held. `read` is given `undefined` when
   * `ms` pass without one, or the socket closes first, and says whether
   * the connection goes on: once it does not, nothing more is kept.
   */
  first(ms: number, read: (raw: string | undefined) => boolean): void;
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
 * lost, leaving the client connected to nothing. What it takes in is
 * bounded twice, by frames and by their size, its first frame among them:
 * a socket that sends more frames than it may before then, or more
 * characters, or one frame larger than a message may be — which is not
 * even read as text — is let go of. Nothing more it sends is kept, and
 * `onOverflow` is told what it had sent, to close it.
 *
 * @param ws - The admitted socket
 * @param limits - How many frames, and how much, it may send before its connection is admitted
 * @param onOverflow - Told of a socket closed for sending more
 * @returns The inbox, opened once the connection is
 * @example
 * ```ts
 * const inbox = holdFrames(ws, { frames: 200, size: 262_144, frameSize: 65_536 }, (held) => close(held));
 * inbox.first(3000, (raw) => raw !== undefined && isAuth(raw));
 * inbox.open((raw) => routeMessage(ctx, raw, heartbeat));
 * ```
 */
export function holdFrames(
  ws: WebSocketLike,
  limits: HeldLimits,
  onOverflow: (held: HeldCount) => void,
): WSInbox {
  let held: string[] | undefined = [];
  const taken = { frames: 0, size: 0 };
  let route: ((raw: string) => void) | undefined;
  /* What reads the first frame, until it has come. */
  let reading: ((raw: string | undefined) => void) | undefined;
  ws.addEventListener("message", (event) => {
    if (route !== undefined) route(textOf(event.data));
    else take(event.data);
  });
  ws.addEventListener("close", () => reading?.(undefined));

  function take(data: unknown): void {
    if (held === undefined) return;
    const raw = sizeOf(data) > limits.frameSize ? undefined : textOf(data);
    if (
      raw === undefined ||
      taken.frames >= limits.frames ||
      taken.size + raw.length > limits.size
    ) {
      held = undefined;
      onOverflow({ ...taken });
      return;
    }
    taken.frames++;
    taken.size += raw.length;
    if (reading !== undefined) reading(raw);
    else held.push(raw);
  }

  return {
    first(ms, read) {
      const timer = setTimeout(() => reading?.(undefined), ms);
      reading = (raw) => {
        reading = undefined;
        clearTimeout(timer);
        if (!read(raw)) held = undefined;
      };
      /* One that came before it was asked for is read now. */
      const already = held?.shift();
      if (already !== undefined) reading(already);
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
