/**
 * The protocol's rules every server of it shares, a mock's too, with no
 * connection of the handler's behind them: a first frame is read as an
 * `auth` of version 2, or refused with 1002 and why; `auth_ok` is put
 * together from the connection, its heartbeat and its limits; and a socket
 * is closed after the frame that says why, `auth_error` before `auth_ok`,
 * `disconnect` after it.
 */
import { describe, expect, it, vi } from "vitest";

import { closeWithNotice } from "../src/adapter/ws-close";
import { authOkFrame, readFirstFrame } from "../src/adapter/ws-handshake";
import * as internal from "../src/internal";
import { createFakeSocket } from "./helpers/fake-socket";

const version = (reason: string) => ({ refused: { kind: "version", reason } });

describe("readFirstFrame", () => {
  it("takes an auth of version 2 as it came", () => {
    const raw = JSON.stringify({ type: "auth", v: 2, id: "a1", payload: { auth: { token: "t" } } });

    expect(readFirstFrame(raw, 65_536)).toEqual({
      auth: { type: "auth", v: 2, id: "a1", payload: { auth: { token: "t" } } },
    });
  });

  it.each([
    ['{"type":"auth","id":"a1"}', "Protocol version 2 required: reload the page"],
    ['{"type":"auth","v":1}', "Protocol version 2 is spoken here, not 1"],
    ['{"type":"auth","v":"2"}', "Protocol version 2 is spoken here"],
    ['{"type":"subscribe","topic":"t"}', "The first frame is auth"],
    ['{"type":"nothing"}', "The first frame is auth"],
    ["not json", "The first frame is auth"],
  ])("refuses %s with 1002: %s", (raw, reason) => {
    expect(readFirstFrame(raw, 65_536)).toEqual(version(reason));
  });

  it("refuses a first frame larger than the server reads, unread", () => {
    const raw = JSON.stringify({ type: "auth", v: 2, payload: "x".repeat(100) });

    expect(readFirstFrame(raw, 64)).toEqual(version("The first frame is auth"));
  });
});

describe("authOkFrame", () => {
  it("names the version, the connection, its heartbeat and its limits, with the auth's id", () => {
    const fields = {
      connectionId: "c1",
      heartbeat: { intervalMs: 25_000, timeoutMs: 10_000 },
      limits: { maxMessageSize: 65_536, maxSubscriptions: 100 },
    };

    expect(authOkFrame({ ...fields, id: "a1" })).toEqual({
      type: "auth_ok",
      id: "a1",
      v: 2,
      ...fields,
    });
    expect(authOkFrame(fields)).not.toHaveProperty("id");
  });
});

describe("closeWithNotice", () => {
  it("says why with auth_error, then closes, a client not let in", () => {
    const socket = createFakeSocket();

    const said = closeWithNotice(socket, { kind: "no-auth-frame", timeoutMs: 3000 }, false);

    expect(said).toEqual({ code: 4408, reason: "No auth frame within 3000 ms" });
    expect(socket.sent).toEqual([
      { type: "auth_error", error: { code: 4408, message: "No auth frame within 3000 ms" }, v: 2 },
    ]);
    expect(socket.closed).toMatchObject(said);
  });

  it("refuses credentials no client sends with auth_error naming their frame", () => {
    const socket = createFakeSocket();

    closeWithNotice(socket, { kind: "bad-auth-frame", id: "a1" }, false);

    expect(socket.sent).toEqual([
      { type: "auth_error", id: "a1", error: { code: 4401, message: "Invalid auth frame" }, v: 2 },
    ]);
    expect(socket.closed).toMatchObject({ code: 4401, reason: "Invalid auth frame" });
  });

  it("says why with disconnect, then closes, a client let in", () => {
    const socket = createFakeSocket();

    closeWithNotice(socket, { kind: "evicted" }, true);

    expect(socket.sent).toEqual([
      { type: "disconnect", code: 4409, reason: "Replaced by a newer connection" },
    ]);
    expect(socket.closed).toMatchObject({ code: 4409 });
  });

  it("closes a socket that takes no frame, or throws on one, all the same", () => {
    const shut = { ...createFakeSocket(), readyState: 3, send: vi.fn(), close: vi.fn() };
    const throwing = createFakeSocket();
    throwing.send = () => {
      throw new Error("gone");
    };

    closeWithNotice(shut, { kind: "internal" }, true);
    closeWithNotice(throwing, { kind: "internal" }, true);

    expect(shut.send).not.toHaveBeenCalled();
    expect(shut.close).toHaveBeenCalledWith(1011, "Internal error");
    expect(throwing.closed).toMatchObject({ code: 1011 });
  });
});

describe("@noverax/courier/internal", () => {
  it("hands every server of the protocol its rules, so none keeps a copy", () => {
    expect(internal).toMatchObject({
      PROTOCOL_VERSION: 2,
      readFirstFrame,
      authOkFrame,
      closeWithNotice,
      closeOf: expect.any(Function),
      noticeOf: expect.any(Function),
      isSendableCloseCode: expect.any(Function),
    });
  });

  it("hands them the defaults auth_ok tells a client, the handler's own", () => {
    expect(internal.WS_DEFAULTS).toEqual({
      heartbeatIntervalMs: 25_000,
      heartbeatTimeoutMs: 10_000,
      authTimeoutMs: 3_000,
      maxMessageSize: 65_536,
      maxSubscriptions: 100,
    });
  });
});
