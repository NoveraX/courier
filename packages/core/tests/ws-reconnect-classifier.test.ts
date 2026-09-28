import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { AuthError, ForbiddenError, RateLimitError } from "../src/realtime/errors";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { shouldReconnect } from "../src/realtime/ws/reconnect-classifier";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

describe("shouldReconnect", () => {
  it.each([
    [1000, false, "normal close"],
    [1001, true, "going away (server restart)"],
    [1002, false, "protocol error"],
    [1003, false, "unsupported data"],
    [1005, true, "no status received"],
    [1006, true, "abnormal closure"],
    [1007, false, "invalid frame payload"],
    [1008, false, "policy violation"],
    [1009, true, "message too big: that message is gone, the rest go on"],
    [1011, true, "unexpected condition"],
    [1012, true, "service restart"],
    [1013, true, "try again later"],
    [1014, true, "bad gateway"],
    [1015, true, "TLS handshake"],
    [4000, false, "custom fatal lower bound"],
    [4050, false, "custom fatal mid"],
    [4099, false, "custom fatal upper bound"],
    [4100, true, "custom retriable lower bound"],
    [4200, true, "custom retriable"],
    [4401, false, "connection rejected"],
    [4403, false, "origin not allowed"],
    [4421, false, "host not allowed"],
    [4408, true, "heartbeat timeout"],
    [4429, false, "too many connections"],
    [9999, true, "unknown defaults to retry"],
  ])("code %i → %s (%s)", (code, expected) => {
    expect(shouldReconnect(code)).toBe(expected);
  });
});

describe("a connection the server refuses", () => {
  const { channel } = courier();
  const room = channel
    .variables(z.object({ room: z.string() }))
    .send(z.object({ text: z.string() }))
    .response<string>()
    .implement(() => ({ onMessage: () => undefined }));
  let served: ServedWS | undefined;

  afterEach(async () => {
    await stopWS(served);
    served = undefined;
  });

  function open(url: string, socketFactory?: (url: string) => WSClientSocket) {
    const ch = executeWSChannel(url, "api.live.room", { room: "a" }, { socketFactory });
    const errors: unknown[] = [];
    const statuses: string[] = [];
    ch.on("error", (error) => errors.push(error));
    ch.on("status", (status) => statuses.push(status));
    return { ch, errors, statuses };
  }

  it("ends the channel with the rejection instead of reconnecting when onConnect throws", async () => {
    let attempts = 0;
    served = await serveWS(
      { room },
      {
        onConnect: () => {
          attempts++;
          throw new Error("bad token");
        },
      },
    );

    const { ch, errors, statuses } = open(served.url);
    await settle(1_500);

    expect(attempts).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(AuthError);
    expect(ch.status).toBe("disconnected");
    expect(statuses).not.toContain("reconnecting");
  });

  it("ends the channel when the address has too many connections", async () => {
    served = await serveWS({ room }, { maxConnectionsPerIP: 1 });
    const first = open(served.url);
    await settle(100);

    const second = open(`${served.url}?peer=second`);
    await settle(1_500);
    first.ch.close();

    expect(second.errors).toHaveLength(1);
    expect(second.errors[0]).toBeInstanceOf(RateLimitError);
    expect(second.ch.status).toBe("disconnected");
    expect(second.statuses).not.toContain("reconnecting");
  });

  it("ends the channel when its origin is not allowed", async () => {
    served = await serveWS({ room }, { allowedOrigins: ["https://app.example.com"] });
    const fromElsewhere = (url: string) =>
      new WebSocket(url, { origin: "https://evil.example.com" }) as unknown as WSClientSocket;

    const { ch, errors, statuses } = open(served.url, fromElsewhere);
    await settle(1_500);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ForbiddenError);
    expect(ch.status).toBe("disconnected");
    expect(statuses).not.toContain("reconnecting");
  });
});
