import type { RefusalLog } from "../logger/refusal-log";
import type { PubSubAdapter } from "../realtime/adapters";
import { createInOrder } from "../utils/in-order";
import { randomId } from "../utils/random-id";
import {
  CLUSTER_MESSAGE_VERSION,
  type ClusterMessage,
  type ReadMessage,
  readClusterMessage,
} from "./cluster-message";
import { createClusterSigner, type UnsignedMessage } from "./cluster-signature";
import { createPubSubChannels } from "./pubsub-channels";
import { createReplayGuard } from "./replay-guard";
import { warnUnsignedCommands } from "./ws-cluster-secret";
import type { CheckedCommand, ConnectionCommand } from "./ws-connection-command";

/**
 * The channel commands travel on, under the adapter's prefix. No topic can
 * take this name: a topic always names a source and an endpoint, with dots.
 */
export const CONTROL_CHANNEL = "courier:ws:control";

/** A message read as a command this replica knows. */
type ReadCommand = Extract<ReadMessage, { readonly message: ClusterMessage }>;

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
  /** The channel the commands travel on (default `CONTROL_CHANNEL`, the WebSocket handlers') */
  readonly channel?: string | undefined;
}

/**
 * The replicas' control channel: a command one sends reaches the others,
 * each of which acts on it once, near the time it was sent, in the order
 * it was sent, and only once it has read it as one it knows — signed by
 * the cluster for this channel when there is a secret. The replica that
 * sends a command has acted on it: the same message published back to it,
 * whatever origin it claims, is a replay there too. What a replica refuses
 * is logged on one line, never acted on; another version's command is
 * skipped. Without a secret, the log says once for the adapter that its
 * commands are taken unsigned, unless a bus in the process made it.
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
  const { pubsub, run, refusals, channel = CONTROL_CHANNEL } = options;
  const signer =
    options.secret === undefined ? undefined : createClusterSigner(options.secret, channel);
  if (!signer) warnUnsignedCommands(pubsub);
  const replay = createReplayGuard({ windowMs: WINDOW_MS, capacity: SEEN_IDS });
  const channels = createPubSubChannels(pubsub);
  /* Web Crypto signs and checks beside the event loop, where a later message's work can end
     first: commands are published in the order they were sent, and acted on as they came. */
  const sending = createInOrder();
  const receiving = createInOrder();

  function refuse(code: string, fields?: Record<string, string>): void {
    refusals.warn({ event: "cluster command refused", code, fields });
  }

  /* What arrived, read and its signature checked: the command to act on, or nothing. */
  async function check(raw: unknown): Promise<ReadCommand | undefined> {
    const read = readClusterMessage(raw);
    if ("skipped" in read) {
      refusals.info({
        event: "cluster command skipped",
        code: `UNKNOWN_${read.skipped.toUpperCase()}`,
      });
      return undefined;
    }
    if ("malformed" in read) {
      refuse("MALFORMED", { why: read.malformed });
      return undefined;
    }
    if (signer && !(await signer.verify(read.message))) {
      refuse(read.message.sig === undefined ? "UNSIGNED" : "SIGNATURE_INVALID");
      return undefined;
    }
    return read;
  }

  /* Its id remembered once its signature is checked, so what no replica signed takes no room. */
  function act(read: ReadCommand | undefined): void {
    if (read === undefined) return;
    const { message, selection } = read;
    const verdict = replay.admit(message.id, message.at);
    if (verdict === "fresh") run({ command: message.cmd, selection });
    else refuse(verdict.toUpperCase());
  }

  async function signed(unsigned: UnsignedMessage): Promise<ClusterMessage> {
    return signer ? { ...unsigned, sig: await signer.sign(unsigned) } : unsigned;
  }

  channels.retain(channel, (raw) => {
    receiving(check(raw), act).catch((error: unknown) => {
      refusals.warn({ event: "cluster command failed", code: "INTERNAL" }, error);
    });
  });

  return {
    async send(cmd) {
      const at = Date.now();
      const unsigned = { v: CLUSTER_MESSAGE_VERSION, id: randomId(), at, cmd } as const;
      /* Acted on here as it is sent: published back to this replica, it is a replay. */
      replay.admit(unsigned.id, at);
      await sending(signed(unsigned), (message) =>
        pubsub.publish(channel, message, { control: true }),
      );
    },
    destroy: () => channels.destroy(),
  };
}
