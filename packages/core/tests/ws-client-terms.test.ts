/**
 * A WebSocket handler tells each client, as it lets its socket in, the
 * heartbeat it keeps and the largest message it reads. It is made only
 * with terms its clients keep: given any other — where a client would
 * take each of its sockets for a server of another version, and connect
 * again for ever — it is refused as it is made, naming the option.
 */
import { describe, expect, it } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import { WS_DEFAULTS } from "../src/adapter/ws-defaults";
import { authOkFrame } from "../src/adapter/ws-handshake";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import { readServerFrame } from "../src/realtime/ws/server-frames";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";

/* The longest a timer waits. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

/* Whether a client keeps the terms the handler's auth_ok would tell it. */
function clientKeeps(options: WSHandlerConfig): boolean {
  const frame = authOkFrame({
    id: "a1",
    connectionId: "c1",
    heartbeat: {
      intervalMs: options.heartbeatIntervalMs ?? WS_DEFAULTS.heartbeatIntervalMs,
      timeoutMs: options.heartbeatTimeoutMs ?? WS_DEFAULTS.heartbeatTimeoutMs,
    },
    limits: {
      maxMessageSize: options.maxMessageSize ?? WS_DEFAULTS.maxMessageSize,
      maxSubscriptions: WS_DEFAULTS.maxSubscriptions,
    },
  });
  return "frame" in readServerFrame(encodeMessage(frame));
}

describe("the heartbeat and message size of a WebSocket handler", () => {
  it.each<[string, WSHandlerConfig, string]>([
    ["an interval in part of a ms", { heartbeatIntervalMs: 1.5 }, "heartbeatIntervalMs"],
    ["an interval of none", { heartbeatIntervalMs: 0 }, "heartbeatIntervalMs"],
    ["a timeout that is no number", { heartbeatTimeoutMs: Number.NaN }, "heartbeatTimeoutMs"],
    [
      "waits longer together than a timer waits",
      { heartbeatIntervalMs: LONGEST_WAIT_MS - WS_DEFAULTS.heartbeatTimeoutMs + 1 },
      "heartbeatIntervalMs, heartbeatTimeoutMs",
    ],
    ["a message size with no end", { maxMessageSize: Number.POSITIVE_INFINITY }, "maxMessageSize"],
    ["a message size under a byte", { maxMessageSize: 0.5 }, "maxMessageSize"],
  ])("refuses %s, which no client keeps", (_, options, named) => {
    expect(clientKeeps(options)).toBe(false);
    expect(() => createWSHandler(options)).toThrow(
      expect.objectContaining({
        code: "WS_OPTIONS_INVALID",
        message: expect.stringContaining(`createWSHandler({ ${named} })`),
      }),
    );
  });

  it("takes the longest waits and the largest size a client keeps", async () => {
    const options = {
      heartbeatIntervalMs: LONGEST_WAIT_MS - 1,
      heartbeatTimeoutMs: 1,
      maxMessageSize: Number.MAX_SAFE_INTEGER,
    };

    expect(clientKeeps(options)).toBe(true);
    await createWSHandler(options).destroy({ timeoutMs: 100 });
  });
});
