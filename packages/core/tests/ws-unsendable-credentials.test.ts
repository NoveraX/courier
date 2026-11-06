/**
 * Credentials no frame can carry — a `ws.auth` holding a BigInt, as an ORM
 * gives a bigint column, or a session object that points back at itself —
 * end the connection with why, as a socket the platform cannot make does:
 * no attempt could send them. Nothing is left unhandled, so a process the
 * client runs in, a server rendering a page or a relay, goes on, and no
 * socket is opened for credentials that would never go out. Made-up URL
 * and values; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionError } from "../src/realtime/errors";
import type { CloseInfo } from "../src/realtime/subscription-types";
import { socketOptions, type WSAuth } from "../src/realtime/ws/ws-credentials";
import { executeWSChannel } from "../src/realtime/ws-channel-client";

const unhandled: unknown[] = [];
const hearUnhandled = (reason: unknown) => unhandled.push(reason);
let sockets = 0;
let closeChannel: (() => void) | undefined;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.on("unhandledRejection", hearUnhandled);
  unhandled.length = 0;
  sockets = 0;
});

afterEach(() => {
  closeChannel?.();
  closeChannel = undefined;
  process.off("unhandledRejection", hearUnhandled);
  vi.restoreAllMocks();
});

/* A channel whose socket would open with this `ws.auth`, on a socket the test counts and never opens. */
function channelWith(auth: WSAuth) {
  const ch = executeWSChannel("wss://realtime.example.com/ws", "api.live.room", undefined, {
    ...socketOptions({ auth }),
    socketFactory: () => {
      sockets++;
      throw new Error("no socket was to be made");
    },
  });
  closeChannel = () => ch.close();
  const closed: CloseInfo[] = [];
  ch.on("close", (info) => closed.push(info));
  return { ch, closed };
}

const cyclic = (): Record<string, unknown> => {
  const session: Record<string, unknown> = { user: "u1" };
  session.self = session;
  return session;
};

describe("a ws.auth JSON cannot write", () => {
  it.each([
    ["a BigInt", () => ({ tenant: "acme", user: 7n }), "BigInt"],
    ["a cycle", cyclic, "circular"],
  ])(
    "holding %s ends the channel with why, and leaves nothing unhandled",
    async (_what, auth, said) => {
      const { ch, closed } = channelWith(auth);

      await vi.waitFor(() => expect(closed).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(closed[0]).toMatchObject({ reason: "failed", error: expect.any(ConnectionError) });
      expect(closed[0]?.reason === "failed" && closed[0].error.message).toMatch(
        new RegExp(`^The socket's credentials cannot be sent: .*${said}`, "i"),
      );
      expect(ch.status).toBe("disconnected");
      expect(sockets).toBe(0);
      expect(unhandled).toEqual([]);
    },
  );
});
