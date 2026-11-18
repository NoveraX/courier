import { PING_FRAME, PONG_FRAME } from "../../realtime/ws/http-protocol";
import type { HTTPConnection, HTTPCounts } from "./http-connection-types";
import { createDelivery, type Delivery, type DeliveryKind } from "./http-delivery";
import { closeEvent, frameEvent, openEvent, PING_EVENT, STREAM_START } from "./http-events";
import { createIntake } from "./http-intake";
import { createKeptFrames } from "./http-kept";
import { createConnectionListeners } from "./http-listeners";
import { createPings } from "./http-pings";
import type { HTTPTerms } from "./http-terms";

/**
 * A connection over HTTP, handed to the handler as its socket. Each frame
 * the handler sends is numbered and kept until the client acknowledges it,
 * and every answer the client asks for carries what it has not taken yet:
 * an answer lost on the way loses nothing, and a frame the client already
 * took is never sent it again. What is kept is the socket's
 * `bufferedAmount`, so a client that does not keep up loses events and is
 * closed as a socket's would be. The heartbeat's ping is answered by the
 * transport while the client is heard from — an answer held open for it,
 * or a request — and the client is sent it all the same.
 *
 * @param token - The connection's token
 * @param terms - How long it holds a poll, runs a stream and waits to say it closed
 * @param counts - What the transport's connections count together
 * @param onClosed - Told once it has closed, before its handler is
 * @returns The connection, open
 * @example
 * ```ts
 * const connection = createHTTPConnection(token, terms, counts, () => held.delete(token));
 * const delivery = connection.deliver("stream", 0);
 * handleSocket(connection, request);
 * ```
 */
export function createHTTPConnection(
  token: string,
  terms: HTTPTerms,
  counts: HTTPCounts,
  onClosed: () => void,
): HTTPConnection {
  const listeners = createConnectionListeners();
  const kept = createKeptFrames();
  const intake = createIntake((frame) => {
    if (readyState === 1) listeners.message(frame);
  });
  const pings = createPings(() => {
    if (readyState === 1) listeners.message(PONG_FRAME);
  });
  let readyState = 1;
  let delivery: Delivery | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ending = false;
  let opened = false;
  let presented = false;
  let nextSeq = 1;
  let closing: { readonly code: number; readonly reason: string } | undefined;

  function arm(ms: number, then: () => void): void {
    clearTimeout(timer);
    ending = false;
    timer = setTimeout(then, ms);
  }

  /* A poll with something to carry ends once the task that wrote it has, so frames sent together
     go together. */
  function carried(): void {
    if (delivery?.kind !== "poll" || ending) return;
    arm(0, () => delivery?.end());
    ending = true;
  }

  function detach(ended: Delivery, left: boolean): void {
    if (delivery !== ended) return;
    delivery = undefined;
    clearTimeout(timer);
    ending = false;
    /* Given up before any request carried the token its first answer brought: nobody holds it. */
    if (left && !presented) finish(1006);
  }

  function finish(code: number): void {
    if (readyState === 3) return;
    readyState = 3;
    clearTimeout(timer);
    const last = delivery;
    delivery = undefined;
    last?.end();
    kept.clear();
    onClosed();
    listeners.closed(code);
  }

  function deliver(kind: DeliveryKind, ack: number, holdMs = terms.holdMs): Delivery {
    kept.acknowledge(ack);
    const previous = delivery;
    delivery = undefined;
    previous?.end();
    clearTimeout(timer);
    ending = false;
    const next = createDelivery(kind, (left) => detach(next, left));
    delivery = next;
    if (!opened) {
      next.write(openEvent({ token, ackBytes: terms.ackBytes, maxBytes: terms.maxBodyBytes }));
    } else if (kind === "stream") next.write(STREAM_START);
    opened = true;
    const pinged = pings.takeUnsent();
    if (pinged) next.write(PING_EVENT);
    const unsent = pinged || kept.size > 0;
    counts.resent += kept.each((bytes) => next.write(bytes));
    if (closing !== undefined) {
      next.write(closeEvent(closing));
      finish(closing.code);
    } else if (kind === "stream") {
      arm(terms.streamMs, () => {
        counts.rotated++;
        next.end();
      });
    } else if (unsent) carried();
    else arm(holdMs, () => next.end());
    return next;
  }

  return {
    token,
    get delivering() {
      return delivery?.kind;
    },
    get holding() {
      return delivery?.kind === "poll" && !ending;
    },
    get readyState() {
      return readyState;
    },
    get bufferedAmount() {
      return kept.bytes;
    },
    addEventListener: listeners.addEventListener,
    send(data) {
      if (readyState !== 1) return;
      if (data === PING_FRAME) {
        pings.sent(delivery !== undefined);
        delivery?.write(PING_EVENT);
        carried();
        return;
      }
      const bytes = frameEvent(nextSeq, data);
      kept.keep(nextSeq++, bytes, delivery !== undefined);
      delivery?.write(bytes);
      carried();
    },
    close(code = 1000, reason = "") {
      if (readyState !== 1) return;
      readyState = 2;
      closing = { code, reason };
      if (delivery === undefined) arm(terms.lingerMs, () => finish(code));
      else {
        delivery.write(closeEvent(closing));
        finish(code);
      }
    },
    deliver,
    receive: intake.receive,
    acknowledge: kept.acknowledge,
    presented() {
      presented = true;
      pings.heard();
    },
    peerClose: finish,
    end() {
      finish(closing?.code ?? 1006);
    },
  };
}
