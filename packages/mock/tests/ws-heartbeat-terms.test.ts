/**
 * A mock tells each client, as it lets the socket in, the heartbeat it
 * keeps, as a Courier server does. It is made only with one its clients
 * keep: given any other — where a client would take each of its sockets
 * for a server of another version, and connect again for ever — it is
 * refused as it is made, naming the option.
 */
import type { HeartbeatConfig } from "@noverax/courier/internal";
import { WS_DEFAULTS } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import { createMockServer } from "../src/server/create-mock-server";

/* The longest a timer waits. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

function mockWith(heartbeat: HeartbeatConfig) {
  return createMockServer({ port: 0, log: false, admin: false, ws: { heartbeat } });
}

describe("the heartbeat of a mock", () => {
  it.each<[string, HeartbeatConfig, string]>([
    ["an interval in part of a ms", { intervalMs: 1.5 }, "intervalMs"],
    ["an interval of none", { intervalMs: 0 }, "intervalMs"],
    ["a timeout that is no number", { timeoutMs: Number.NaN }, "timeoutMs"],
    [
      "waits longer together than a timer waits",
      { intervalMs: LONGEST_WAIT_MS - WS_DEFAULTS.heartbeatTimeoutMs + 1 },
      "intervalMs, timeoutMs",
    ],
  ])("refuses %s, which no client keeps", (_, heartbeat, named) => {
    expect(() => mockWith(heartbeat)).toThrow(
      expect.objectContaining({
        code: "WS_OPTIONS_INVALID",
        message: expect.stringContaining(`createMockServer({ ws: { heartbeat: { ${named} } } })`),
      }),
    );
  });

  it("takes the longest waits a client keeps", () => {
    expect(() => mockWith({ intervalMs: LONGEST_WAIT_MS - 1, timeoutMs: 1 })).not.toThrow();
  });
});
