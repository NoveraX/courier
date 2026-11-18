import { onResume } from "../resume-signals";
import { PING_FRAME, PONG_FRAME } from "./http-protocol";
import { letGo } from "./websocket-attempt";
import type { WSClientSocket } from "./ws-types";

/** What a connection carried over HTTP watches for a WebSocket getting through with. */
export interface WebSocketWatch {
  /** Opens a WebSocket to the connection's path, as its first socket was opened */
  readonly open: () => WSClientSocket;
  /** How long a probe's server may take to answer its ping, in ms */
  readonly afterMs: number;
  /** Whether the page's resume signals send a probe too */
  readonly resume: boolean;
  /** A probe was answered: a WebSocket gets through again */
  readonly climbed: () => void;
  /** Where each wait's spread comes from: `Math.random`, unless a test hands in its own */
  readonly random?: (() => number) | undefined;
}

/* The first wait for a probe, which each probe not answered doubles up to the longest. */
const FIRST_WAIT_MS = 30_000;
const LONGEST_WAIT_MS = 300_000;
/* The close of a probe answered: it did what it was opened for. */
const NORMAL_CLOSE = 1000;

/**
 * Watch for a WebSocket getting through again while HTTP carries a
 * connection. A probe is a WebSocket to the connection's path that sends a
 * `ping` before any `auth`, which a server answers with `pong` and admits
 * nothing for. The first goes within 30 s, and each after one not answered
 * within twice as long, up to 5 minutes, at a random point of the wait's
 * second half, so the clients one outage moved do not probe together; with
 * `resume`, the page's resume signals send one at once, one in 30 s at
 * most. A probe answered with `pong` within `afterMs` is closed, the watch
 * ends and `climbed` is told; one refused, dropped, answered with anything
 * else or not in time is let go of.
 *
 * @param watch - How a probe is opened, how long it may take, and who is told
 * @returns Ends the watch: a probe under way is let go of, and none follows
 * @example
 * ```ts
 * const end = watchForWebSocket({ open: () => new WebSocket(url), afterMs: 3000, resume: true, climbed });
 * ```
 */
export function watchForWebSocket(watch: WebSocketWatch): () => void {
  const random = watch.random ?? Math.random;
  let wait = FIRST_WAIT_MS;
  let last = performance.now();
  let probing: (() => void) | undefined;
  let timer = setTimeout(probe, spread(wait, random));
  let unhear = watch.resume ? onResume(resumed) : undefined;

  function resumed(): void {
    if (probing === undefined && performance.now() - last >= FIRST_WAIT_MS) probe();
  }

  function probe(): void {
    clearTimeout(timer);
    last = performance.now();
    probing = probeOnce(watch, (answered) => {
      probing = undefined;
      if (answered) {
        end();
        watch.climbed();
        return;
      }
      wait = Math.min(wait * 2, LONGEST_WAIT_MS);
      timer = setTimeout(probe, spread(wait, random));
    });
  }

  function end(): void {
    clearTimeout(timer);
    unhear?.();
    unhear = undefined;
    probing?.();
    probing = undefined;
  }
  return end;
}

/* A random point of a wait's second half. */
function spread(wait: number, random: () => number): number {
  return wait / 2 + random() * (wait / 2);
}

/* One probe: `settled` is told once whether its pong came in time, unless it is let go of first. */
function probeOnce(watch: WebSocketWatch, settled: (answered: boolean) => void): () => void {
  let over = false;
  let socket: WSClientSocket | undefined;
  const timer = setTimeout(() => done(false), watch.afterMs);

  function done(answered: boolean, tell = true): void {
    if (over) return;
    over = true;
    clearTimeout(timer);
    if (socket !== undefined && answered) letGo(socket, NORMAL_CLOSE, "");
    else if (socket !== undefined) letGo(socket);
    if (tell) settled(answered);
  }

  try {
    socket = watch.open();
  } catch {
    /* A socket that cannot be made is a probe not answered. */
    queueMicrotask(() => done(false));
    return () => done(false, false);
  }
  const opened = socket;
  opened.onopen = () => opened.send(PING_FRAME);
  opened.onmessage = (event) => done(event.data === PONG_FRAME);
  opened.onclose = opened.onerror = () => done(false);
  return () => done(false, false);
}
