import type { ScopedLogger } from "../../logger";
import { CLIENT_LIMITS } from "../client-limits";
import type { MachineEffect } from "./connection-machine-types";
import type { ConnectionRuntime, RuntimeHooks } from "./connection-runtime";
import type { Liveness } from "./liveness";
import type { MessageQueue } from "./message-queue";
import { readServerFrame } from "./server-frames";
import { requestSubscription } from "./topic-operations";
import type { TopicRegistry } from "./topic-registry-types";
import type { Subscription } from "./topic-subscription";
import { dispatchIncomingMessage } from "./ws-message-handler";
import { encodeMessage } from "./ws-protocol";

/** What a connection's part of each transition works with. */
export interface HookParts {
  readonly topics: TopicRegistry;
  readonly queue: MessageQueue<Subscription>;
  readonly liveness: Liveness;
  readonly log: ScopedLogger;
  /** The server's ping interval and pong timeout, as the connection counts on them */
  readonly heartbeat: { readonly intervalMs: number; readonly timeoutMs: number };
  /** Whether the connection has credentials to send again when the server asks */
  readonly renewable: boolean;
  /** Warn of something once for the connection's life, however often it happens */
  notice(kind: string, text: string): void;
}

/**
 * A connection's part of its machine's transitions: subscribing on a socket
 * that opens, reading what comes on it, and what the machine says about
 * subscriptions, the queue and the liveness watch.
 *
 * @param parts - The connection's subscriptions, queue and watch
 * @returns The hooks its runtime calls
 */
export function connectionHooks(parts: HookParts): RuntimeHooks {
  const { topics, queue, liveness, log, heartbeat, notice } = parts;
  return {
    opened(runtime) {
      for (const entry of topics.entries()) {
        requestSubscription({ runtime, topics }, entry.qualifiedTopic, entry.variables);
      }
      /* A server before 0.5 sends nothing until it admits the socket: its answer to this ping says it has. */
      runtime.send(encodeMessage({ type: "ping" }));
    },
    message(runtime, data) {
      liveness.heard();
      if (runtime.state.phase === "authenticating") {
        runtime.dispatch({ type: "admitted", protocol: 1 });
      }
      const reading = readServerFrame(data);
      if ("unknown" in reading) {
        notice(
          "unknown",
          `Ignored a frame of a kind this client does not know: ${reading.unknown}`,
        );
      } else if ("invalid" in reading) {
        notice("invalid", `Ignored a message that is not a valid frame: ${reading.invalid}`);
      } else if (reading.frame.type === "data" && reading.frame.topic === undefined) {
        notice(
          "topicless",
          "Ignored data sent to the connection, not to a topic: channels hear what comes on their topics",
        );
      } else {
        dispatchIncomingMessage(
          { runtime, topics, queue, log, renewable: parts.renewable },
          reading.frame,
        );
      }
    },
    effect(runtime, effect) {
      run(runtime, effect, parts, heartbeat);
    },
  };
}

function run(
  runtime: ConnectionRuntime,
  effect: MachineEffect,
  { topics, queue, liveness, log }: HookParts,
  heartbeat: HookParts["heartbeat"],
): void {
  switch (effect.type) {
    case "subscriptions-wait":
      topics.unconfirmAll(effect.error);
      return;
    case "subscriptions-end": {
      topics.endAll(effect.error);
      const count = queue.clear();
      if (count > 0) log.warn(`${count} message(s) were not sent: the connection ended first`);
      return;
    }
    case "watch":
      liveness.watch(heartbeat.intervalMs + heartbeat.timeoutMs);
      return;
    case "unwatch":
      liveness.stop();
      return;
    case "probe":
      liveness.probe(Math.min(heartbeat.timeoutMs, CLIENT_LIMITS.WS_RESUME_PROBE_TIMEOUT_MS));
      return;
    case "flush":
      for (const { topic, payload } of queue.take(undefined)) {
        runtime.send(encodeMessage({ type: "message", topic, payload }));
      }
      return;
    default:
      return;
  }
}
