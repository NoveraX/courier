import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";

import { courier } from "../src/define/courier";
import {
  AuthError,
  ConnectionError,
  ForbiddenError,
  RateLimitError,
  RealtimeError,
  RealtimeValidationError,
} from "../src/realtime/errors";
import { classifyClose } from "../src/realtime/ws/reconnect-classifier";
import type { WSClientSocket } from "../src/realtime/ws/ws-types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

describe("classifyClose", () => {
  it.each([
    [1001, "going away"],
    [1005, "no status received"],
    [1006, "abnormal closure"],
    [1009, "message too big: that message is gone, the rest go on"],
    [1011, "unexpected condition"],
    [1012, "service restart"],
    [1013, "try again later, as a slow consumer is told"],
    [1014, "bad gateway"],
    [1015, "TLS handshake"],
    [4100, "the client gave the socket up for silent"],
    [4200, "a code nothing names"],
    [4408, "a heartbeat or admission timeout"],
    [9999, "a code no range names"],
  ])("reconnects after %i (%s)", (code) => {
    expect(classifyClose({ code, reason: "" })).toEqual({ action: "retry" });
  });

  it.each([
    [1002, "protocol error", ConnectionError],
    [1003, "unsupported data", ConnectionError],
    [1007, "invalid frame payload", ConnectionError],
    [1008, "policy violation", ConnectionError],
    [4000, "an application code", RealtimeError],
    [4099, "an application code", RealtimeError],
    [4400, "the client broke the protocol", RealtimeError],
    [4403, "origin not allowed", ForbiddenError],
    [4404, "what the connection names is not there", RealtimeError],
    [4409, "replaced by a newer connection", RealtimeError],
    [4413, "more than the server takes", RealtimeError],
    [4418, "a refusal of the client's own, as an HTTP 4xx is", RealtimeError],
    [4421, "host not allowed", RealtimeError],
    [4422, "what the client sent, its schema refuses", RealtimeValidationError],
    [4429, "a limit that names no wait to come back after", RateLimitError],
    [4499, "the last of those refusals", RealtimeError],
  ])("gives up after %i (%s)", (code, _why, kind) => {
    const disposition = classifyClose({ code, reason: "Refused" });

    expect(disposition.action).toBe("stop");
    if (disposition.action !== "stop") return;
    expect(disposition.error).toBeInstanceOf(kind);
    expect(disposition.error.code).toBe(code);
    expect(disposition.error.message).toBe("Refused");
  });

  it("reconnects after 1002 from a server older than the client: a rollout replaces it", () => {
    expect(classifyClose({ code: 1002, reason: "Old", version: 1 })).toEqual({ action: "retry" });
    expect(classifyClose({ code: 1002, reason: "Old", version: 1, retryAfterMs: 900 })).toEqual({
      action: "retry",
      afterMs: 900,
    });
  });

  it.each([
    [3, "a server newer than the client: the page has to be loaded again"],
    [2, "a server of the client's own version: the client's auth frame was broken"],
  ])("gives up after 1002 from server version %i (%s)", (version) => {
    const disposition = classifyClose({ code: 1002, reason: "Refused", version });

    expect(disposition.action).toBe("stop");
    expect(disposition.action === "stop" && disposition.error).toBeInstanceOf(ConnectionError);
  });

  it("ends the connection as the server ended it after 1000", () => {
    expect(classifyClose({ code: 1000, reason: "" })).toEqual({ action: "finish" });
  });

  it("asks for the credentials anew after 4401, with the server's reason", () => {
    const disposition = classifyClose({ code: 4401, reason: "Token expired" });

    expect(disposition.action).toBe("reauthenticate");
    if (disposition.action !== "reauthenticate") return;
    expect(disposition.error).toBeInstanceOf(AuthError);
    expect(disposition.error.message).toBe("Token expired");
  });

  it("comes back after the wait the server asked for", () => {
    expect(classifyClose({ code: 4429, reason: "", retryAfterMs: 2000 })).toEqual({
      action: "retry",
      afterMs: 2000,
    });
    expect(classifyClose({ code: 1001, reason: "", retryAfterMs: 500 })).toEqual({
      action: "retry",
      afterMs: 500,
    });
  });

  it("waits no longer than a client ever waits, whatever the server asked for", () => {
    expect(classifyClose({ code: 1013, reason: "", retryAfterMs: 86_400_000 })).toEqual({
      action: "retry",
      afterMs: 300_000,
    });
  });

  it("ignores a wait that is no number of ms", () => {
    expect(classifyClose({ code: 1001, reason: "", retryAfterMs: -1 })).toEqual({
      action: "retry",
    });
    expect(classifyClose({ code: 4429, reason: "", retryAfterMs: Number.NaN }).action).toBe("stop");
  });

  it("names a close the server gave no reason for", () => {
    const disposition = classifyClose({ code: 4403, reason: "" });

    expect(disposition.action === "stop" && disposition.error.message).toBe("Connection closed");
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

  it.each([
    [4404, () => new RealtimeError(4404, "No such tenant")],
    [4413, () => new RealtimeError(4413, "Too much asked for")],
    [4422, () => new RealtimeValidationError("Invalid auth: tenant is required")],
  ])(
    "ends the channel with a refusal %i of onConnect, which asking again would meet",
    async (code, refusal) => {
      let attempts = 0;
      served = await serveWS(
        { room },
        {
          onConnect: () => {
            attempts++;
            throw refusal();
          },
        },
      );

      const { ch, errors, statuses } = open(served.url);
      await settle(1_500);

      expect(attempts).toBe(1);
      expect(errors).toEqual([expect.objectContaining({ code, message: refusal().message })]);
      expect(ch.status).toBe("disconnected");
      expect(statuses).not.toContain("reconnecting");
    },
  );

  it("calls the channel back after the server's wait when the address has too many connections", async () => {
    served = await serveWS({ room }, { maxConnectionsPerIP: 1 });
    const first = open(served.url);
    await expect.poll(() => first.ch.status, { timeout: 2000 }).toBe("connected");

    const second = open(`${served.url}?peer=second`);
    await settle(1_500);
    const status = second.ch.status;
    first.ch.close();
    second.ch.close();

    expect(second.errors).toEqual([]);
    expect(status).toBe("reconnecting");
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
