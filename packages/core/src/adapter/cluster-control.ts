import type { RefusalLog } from "../logger/refusal-log";
import type { PubSubAdapter } from "../realtime/adapters";
import { randomId } from "../utils/random-id";
import { type ClusterMessage, readClusterMessage } from "./cluster-message";
import { createClusterSigner } from "./cluster-signature";
import { createPubSubChannels } from "./pubsub-channels";
import { createReplayGuard } from "./replay-guard";
import type { CheckedCommand, ConnectionCommand } from "./ws-connection-command";

/**
 * The channel commands travel on, under the adapter's prefix. No topic can
 * take this name: a topic always names a source and an endpoint, with dots.
 */
export const CONTROL_CHANNEL = "courier:ws:control";

/** How far from a replica's clock, either way, a command may say it was sent. */
const WINDOW_MS = 60_000;
/** The most command ids a replica remembers, to act on each once. */
const SEEN_IDS = 10_000;

/** Commands for the connections every replica holds, over the pub/sub adapter. */
export interface ClusterControl {
  /** Send a command to the other replicas; resolves once the adapter has taken it */
  send(command: ConnectionCommand): Promise<void>;
  /** Stop listening to the other replicas' commands */
  destroy(): void;
}

export interface ClusterControlOptions {
  readonly pubsub: PubSubAdapter;
  /** The cluster's secret: with it, every command is signed, and one that is not, or not with it, refused */
  readonly secret: string | undefined;
  /** Carry out on this replica a command another sent */
  readonly run: (command: CheckedCommand) => void;
  readonly refusals: RefusalLog;
}

/**
 * The replicas' control channel: a command one sends reaches the others,
 * each of which acts on it once, near the time it was sent, and only once
 * it has read it as one it knows — signed by the cluster when there is a
 * secret. What it refuses is logged on one line, never acted on; a newer
 * replica's command is skipped.
 *
 * @param options - The adapter, the secret, what to do with a command, the log
 * @returns The channel
 *
 * @example
 * ```ts
 * const control = createClusterControl({ pubsub, secret, run, refusals });
 * await control.send(disconnectCommand({ meta: { userId: "u1" } }, undefined).command);
 * ```
 */
export function createClusterControl(options: ClusterControlOptions): ClusterControl {
  const { pubsub, run, refusals } = options;
  const signer = options.secret === undefined ? undefined : createClusterSigner(options.secret);
  const replay = createReplayGuard({ windowMs: WINDOW_MS, capacity: SEEN_IDS });
  const channels = createPubSubChannels(pubsub);

  function refuse(code: string, fields?: Record<string, string>): void {
    refusals.warn({ event: "cluster command refused", code, fields });
  }

  async function receive(raw: unknown): Promise<void> {
    const read = readClusterMessage(raw);
    if ("skipped" in read) {
      refusals.info({
        event: "cluster command skipped",
        code: `UNKNOWN_${read.skipped.toUpperCase()}`,
      });
      return;
    }
    if ("malformed" in read) return refuse("MALFORMED", { why: read.malformed });
    const { message, selection } = read;
    /* Checked before the id is remembered, so what no replica signed takes no room. */
    if (signer && !(await signer.verify(message))) {
      return refuse(message.sig === undefined ? "UNSIGNED" : "SIGNATURE_INVALID");
    }
    const verdict = replay.admit(message.id, message.at);
    if (verdict !== "fresh") return refuse(verdict.toUpperCase());
    run({ command: message.cmd, selection });
  }

  channels.retain(CONTROL_CHANNEL, (raw) => {
    receive(raw).catch((error: unknown) => {
      refusals.warn({ event: "cluster command failed", code: "INTERNAL" }, error);
    });
  });

  return {
    async send(cmd) {
      const unsigned = { v: 1, id: randomId(), at: Date.now(), cmd } as const;
      const message: ClusterMessage = signer
        ? { ...unsigned, sig: await signer.sign(unsigned) }
        : unsigned;
      await pubsub.publish(CONTROL_CHANNEL, message);
    },
    destroy: () => channels.destroy(),
  };
}
