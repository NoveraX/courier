import type { ScopedLogger } from "../../logger";
import { CLIENT_LIMITS } from "../client-limits";
import type { MachineEffect } from "./connection-machine-types";
import type { ConnectionRuntime, RuntimeHooks } from "./connection-runtime";
import type { Liveness } from "./liveness";
import type { MessageQueue } from "./message-queue";
import type { FrameReading } from "./server-frame-types";
import { readServerFrame } from "./server-frames";
import { requestSubscription } from "./topic-operations";
import type { TopicRegistry } from "./topic-registry-types";
import type { Subscription } from "./topic-subscription";
import { closingWith, dispatchIncomingMessage } from "./ws-message-handler";
import { encodeMessage } from "./ws-protocol";

/** What a connection's part of each transition works with. */
export interface HookParts {
  readonly topics: TopicRegistry;
  readonly queue: MessageQueue<Subscription>;
  readonly liveness: Liveness;
  readonly log: ScopedLogger;
  /** What the server takes, as its `auth_ok` said: the largest message, encoded */
  readonly limits: { maxMessageSize: number };
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
  const { topics, queue, liveness, log, notice } = parts;
  return {
    opened(runtime) {
      for (const entry of topics.entries()) {
        requestSubscription({ runtime, topics }, entry.qualifiedTopic, entry.variables);
      }
    },
    message(runtime, data) {
      liveness.heard();
      const reading = readServerFrame(data);
      if (runtime.state.phase === "authenticating") {
        admit(runtime, reading, parts);
      } else if ("unknown" in reading) {
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
      run(runtime, effect, parts);
    },
  };
}

/*
 * The server's first frame on a socket answers the `auth` that opened it:
 * `auth_ok` admits the connection, `auth_error` says why it will not, and
 * `disconnect` that the server is closing. A server of this protocol sends
 * nothing before; any other frame comes from a server of another version.
 */
function admit(runtime: ConnectionRuntime, reading: FrameReading, parts: HookParts): void {
  const { state } = runtime;
  const frame = "frame" in reading ? reading.frame : undefined;
  if (frame?.type === "auth_ok" && state.phase === "authenticating" && frame.id === state.authId) {
    parts.limits.maxMessageSize = frame.limits.maxMessageSize;
    runtime.dispatch({
      type: "admitted",
      connectionId: frame.connectionId,
      heartbeat: frame.heartbeat,
    });
  } else if (frame?.type === "auth_error" || frame?.type === "disconnect") {
    runtime.dispatch(closingWith(frame));
  } else {
    const kind = kindOf(reading);
    parts.log.warn(
      `The server's first frame (${kind}) answers no auth: it speaks another version of the protocol`,
    );
    runtime.dispatch({ type: "mismatch", frame: kind });
  }
}

/* What a message was: the kind of frame, or why it is none. */
function kindOf(reading: FrameReading): string {
  if ("frame" in reading) return reading.frame.type;
  return "unknown" in reading ? reading.unknown : reading.invalid;
}

function run(runtime: ConnectionRuntime, effect: MachineEffect, parts: HookParts): void {
  const { topics, queue, liveness, log } = parts;
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
      liveness.watch(effect.heartbeat.intervalMs + effect.heartbeat.timeoutMs);
      return;
    case "unwatch":
      liveness.stop();
      return;
    case "probe":
      liveness.probe(
        Math.min(effect.heartbeat.timeoutMs, CLIENT_LIMITS.WS_RESUME_PROBE_TIMEOUT_MS),
      );
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
