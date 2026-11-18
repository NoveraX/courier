import { endingOf, type Posted, waitBeforeAgain } from "./http-post";

/** What the outbox sends its requests with. */
export interface OutboxParts {
  /** Make a request of the transport, `keepalive` once the client has closed */
  post(body: string, keepalive: boolean): Promise<Posted>;
  /** The sequence number of the last of the server's frames the client took, which every request acknowledges */
  ack(): number;
  /** A request found the connection gone, or was refused: the socket ends with this */
  ended(code: number, reason: string): void;
}

/** What a socket over HTTP has to send: the client's frames, its acknowledgements, its close. */
export interface Outbox {
  /** Bytes of the frames handed in that the server has not taken yet */
  readonly bytes: number;
  /** Hand in a frame: it goes with every other handed in in the same task */
  push(frame: string): void;
  /** The connection opened: frames go from now on, the first numbered `seq`, in bodies of `maxBytes` at most */
  start(token: string, seq: number, maxBytes: number): void;
  /** Tell the server, with no frame, what the client has taken */
  acknowledge(): void;
  /**
   * Send what was handed in, then the client's close with `code`: settles
   * once the close was answered, nothing more goes, or `withinMs` passed
   */
  close(code: number, withinMs: number): Promise<void>;
  /** Send nothing more: the connection ended */
  stop(): void;
}

interface Queued {
  readonly frame: string;
  readonly bytes: number;
}

/**
 * The client's side of a connection over HTTP: what it sends goes in
 * `send` requests, one at a time, so the server takes the frames in their
 * order. The frames handed in during one task go together, as many as one
 * body carries, numbered on the connection; a request the network or an
 * entry did not answer is made again, the same, and the server takes its
 * frames once. Nothing goes before the connection's token has come.
 *
 * @param parts - How it sends, and where its end goes
 * @returns The outbox, waiting for the connection's token
 * @example
 * ```ts
 * const outbox = createOutbox({ post, ack: () => taken, ended: close });
 * outbox.push('{"type":"message","topic":"chat","payload":"hi"}');
 * outbox.start(token, 3, 1_048_576);
 * ```
 */
export function createOutbox(parts: OutboxParts): Outbox {
  const queue: Queued[] = [];
  let queued = 0;
  let sending = 0;
  let token: string | undefined;
  let seq = 1;
  let maxBytes = 0;
  let busy = false;
  let ackDue = false;
  let closing: number | undefined;
  let stopped = false;
  /* Settles what `close` returned, at the latest when `bound` runs out. */
  let closed: (() => void) | undefined;
  let bound: ReturnType<typeof setTimeout> | undefined;

  /* Nothing more goes: a close waited for is over. */
  function halt(): void {
    stopped = true;
    clearTimeout(bound);
    closed?.();
    closed = undefined;
  }

  function schedule(): void {
    if (busy || stopped || token === undefined) return;
    busy = true;
    queueMicrotask(next);
  }

  function next(): void {
    if (stopped || token === undefined) return;
    if (queue.length > 0 || ackDue) {
      void send(token);
      return;
    }
    busy = false;
    if (closing === undefined) return;
    stopped = true;
    const body = JSON.stringify({ op: "close", token, code: closing });
    void parts.post(body, true).then(halt);
  }

  /* As many frames as one body carries, after a head that numbers the first and acknowledges. */
  async function send(named: string): Promise<void> {
    ackDue = false;
    const head = JSON.stringify({ op: "send", token: named, seq, ack: parts.ack() });
    let size = utf8Length(head);
    let count = 0;
    for (const { bytes } of queue) {
      if (count > 0 && size + bytes + 1 > maxBytes) break;
      size += bytes + 1;
      count++;
    }
    const frames = queue.splice(0, count);
    seq += count;
    sending = frames.reduce((sum, { bytes }) => sum + bytes, 0);
    queued -= sending;
    const body = [head, ...frames.map(({ frame }) => frame)].join("\n");
    for (let failures = 0; !stopped; failures++) {
      const posted = await parts.post(body, closing !== undefined);
      if (stopped) return;
      if (posted.kind === "answered") break;
      /* Once the client has closed, what it handed in goes once: nobody waits for it any more. */
      if (posted.kind === "again" && closing !== undefined) halt();
      else if (posted.kind !== "again") {
        halt();
        const { code, reason } = endingOf(posted);
        parts.ended(code, reason);
      } else {
        await new Promise((resume) =>
          setTimeout(resume, waitBeforeAgain(posted.afterMs, failures)),
        );
        continue;
      }
      return;
    }
    sending = 0;
    next();
  }

  return {
    get bytes() {
      return queued + sending;
    },
    push(frame) {
      if (stopped || closing !== undefined) return;
      const bytes = utf8Length(frame);
      queue.push({ frame, bytes });
      queued += bytes;
      schedule();
    },
    start(named, first, most) {
      token = named;
      seq = first;
      maxBytes = most;
      schedule();
    },
    acknowledge() {
      ackDue = true;
      schedule();
    },
    close(code, withinMs) {
      if (stopped || closing !== undefined) return Promise.resolve();
      closing = code;
      const over = new Promise<void>((settle) => {
        closed = settle;
      });
      if (token === undefined) {
        halt();
      } else {
        bound = setTimeout(halt, withinMs);
        schedule();
      }
      return over;
    },
    stop: halt,
  };
}

/* What a body of text takes in UTF-8: what the server's bound counts. */
function utf8Length(text: string): number {
  let bytes = text.length;
  for (let at = 0; at < text.length; at++) {
    const unit = text.charCodeAt(at);
    /* Each half of a surrogate pair is two of the four bytes the pair takes. */
    if (unit >= 0x800) bytes += unit >= 0xd800 && unit <= 0xdfff ? 1 : 2;
    else if (unit >= 0x80) bytes += 1;
  }
  return bytes;
}
