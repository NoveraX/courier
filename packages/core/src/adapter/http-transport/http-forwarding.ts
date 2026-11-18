import type { RefusalLog } from "../../logger/refusal-log";
import type { PubSubAdapter } from "../../realtime/adapters";
import { randomId } from "../../utils/random-id";
import { createChannelSigner } from "../cluster-signature";
import { createPubSubChannels } from "../pubsub-channels";
import {
  type ForwardAnswer,
  type ForwardMessage,
  type ForwardRequest,
  forwardChannel,
  HTTP_FORWARD_VERSION,
  readForwardMessage,
} from "./forward-message";

/* A holder that is there answers in a round trip; one that does not within this is gone. */
const FORWARD_TIMEOUT_MS = 5_000;
/* How far from this replica's clock, either way, a request may say it was sent. */
const WINDOW_MS = 60_000;

/** A holder's answer: its status and body. */
export interface Answered {
  readonly status: number;
  readonly body: string;
}

/** Why no answer came: the holder did not answer in time, or the adapter cannot carry the request. */
export type Unanswered = { readonly failed: "unreachable" | "unavailable" };

/** Requests sent on to the replicas that hold their connections, and those sent on to this one. */
export interface Forwarding {
  /**
   * Send a request on to the replica that holds its connection, and wait
   * for its answer: `taken` is called once the holder holds the poll, which
   * it then may for `wait`
   */
  forward(
    holder: string,
    request: string,
    wait: number,
    taken?: () => void,
  ): Promise<Answered | Unanswered>;
  /** Hear what other replicas send this one, from now on: settles once the adapter has taken its channel */
  listen(): Promise<void>;
  /** Stop hearing them; every request still waiting is told the adapter cannot carry it */
  destroy(): void;
}

export interface ForwardingOptions {
  readonly pubsub: PubSubAdapter;
  readonly secret: string | undefined;
  /** This replica's name: its channel, and the one its own requests' answers come on */
  readonly replica: string;
  readonly refusals: RefusalLog;
  /** Answer a request another replica sent on to this one; `taken` once a poll is held */
  readonly serve: (request: string, wait: number, taken: () => void) => Promise<Answered>;
}

interface Waiting {
  taken(): void;
  settle(answer: Answered | Unanswered): void;
}

/**
 * Pass the HTTP transport's requests between replicas over the pub/sub
 * adapter, addressed: each replica hears a channel of its own, and a
 * request that reached one that does not hold its connection is published
 * on the holder's channel alone, with an id, the time it was sent, and the
 * channel its answer goes to. The holder answers there; a poll it holds is
 * said to be taken at once, so its asker tells a holder that holds it from
 * one that is gone. Signed with the cluster's secret when it has one, for
 * the channel each message travels on, and a request is acted on only near
 * the time it says it was sent. While the adapter does not reach its
 * server, nothing is sent: what would wait in its queue is answered
 * unavailable at once.
 *
 * @param options - The adapter, the secret, this replica's name, the log, what answers a request
 * @returns The forwarding, not yet listening
 * @example
 * ```ts
 * const forwarding = createForwarding({ pubsub, secret, replica, refusals, serve });
 * const answer = await forwarding.forward(holder, body, 25_000);
 * ```
 */
export function createForwarding(options: ForwardingOptions): Forwarding {
  const { pubsub, replica, refusals, serve } = options;
  const own = forwardChannel(replica);
  const signer = options.secret === undefined ? undefined : createChannelSigner(options.secret);
  const channels = createPubSubChannels(pubsub);
  const waiting = new Map<string, Waiting>();
  let listening: Promise<void> | undefined;

  async function publish(channel: string, message: ForwardMessage): Promise<void> {
    const sig = signer && (await signer.sign(channel, message));
    await pubsub.publish(channel, sig === undefined ? message : { ...message, sig }, {
      control: true,
    });
  }

  async function check(raw: unknown): Promise<ForwardMessage | undefined> {
    const read = readForwardMessage(raw);
    if ("skipped" in read) return undefined;
    if ("malformed" in read) {
      refusals.warn({ event: "forwarded message refused", code: "MALFORMED" }, read.malformed);
      return undefined;
    }
    if (signer && !(await signer.verify(own, read.message))) {
      const code = read.message.sig === undefined ? "UNSIGNED" : "SIGNATURE_INVALID";
      refusals.warn({ event: "forwarded message refused", code });
      return undefined;
    }
    return read.message;
  }

  async function answer(request: ForwardRequest): Promise<void> {
    if (Math.abs(Date.now() - request.at) >= WINDOW_MS) {
      refusals.warn({ event: "forwarded message refused", code: "STALE" });
      return;
    }
    const to = forwardChannel(request.from);
    const { id } = request;
    const taken = (): void => {
      publish(to, { v: HTTP_FORWARD_VERSION, kind: "taken", id }).catch(lost);
    };
    const { status, body } = await serve(request.request, request.wait, taken);
    await publish(to, { v: HTTP_FORWARD_VERSION, kind: "answer", id, status, body });
  }

  function act(message: ForwardMessage | undefined): Promise<void> | undefined {
    if (message?.kind === "request") return answer(message);
    if (message?.kind === "taken") waiting.get(message.id)?.taken();
    if (message?.kind === "answer") waiting.get(message.id)?.settle(answerOf(message));
    return undefined;
  }

  function lost(error: unknown): void {
    refusals.warn({ event: "forwarded request failed", code: "INTERNAL" }, error);
  }

  function listen(): Promise<void> {
    if (listening === undefined) {
      channels.retain(own, (raw) => {
        check(raw).then(act).catch(lost);
      });
      listening = channels.taken(own);
    }
    return listening;
  }

  return {
    listen,
    async forward(holder, request, wait, taken) {
      if (pubsub.state !== "ready") return { failed: "unavailable" };
      await listen();
      const id = randomId();
      return new Promise((resolve) => {
        let timer = setTimeout(() => settle({ failed: "unreachable" }), FORWARD_TIMEOUT_MS);
        function settle(answer: Answered | Unanswered): void {
          if (!waiting.delete(id)) return;
          clearTimeout(timer);
          resolve(answer);
        }
        waiting.set(id, {
          taken() {
            clearTimeout(timer);
            timer = setTimeout(() => settle({ failed: "unreachable" }), wait + FORWARD_TIMEOUT_MS);
            taken?.();
          },
          settle,
        });
        const message: ForwardRequest = {
          v: HTTP_FORWARD_VERSION,
          kind: "request",
          id,
          at: Date.now(),
          from: replica,
          wait,
          request,
        };
        publish(forwardChannel(holder), message).catch(() => settle({ failed: "unavailable" }));
      });
    },
    destroy() {
      channels.destroy();
      for (const each of [...waiting.values()]) each.settle({ failed: "unavailable" });
    },
  };
}

function answerOf({ status, body }: ForwardAnswer): Answered {
  return { status, body };
}
