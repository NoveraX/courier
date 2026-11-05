/**
 * A connection's session: let in once, by `auth_ok`; closed in one place,
 * once, with the code the protocol's table gives the reason, the frame that
 * says why sent just before — `auth_error` before `auth_ok`, `disconnect`
 * after it; and the deadline of credentials asked for again with
 * `reauth_required`, which closes it when they are not renewed in time. A
 * stopping server's pause is drawn anew for each connection.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeReason } from "../src/adapter/close-reason";
import { closeOf, isSendableCloseCode, noticeOf, type SessionClose } from "../src/adapter/ws-close";
import { createSession } from "../src/adapter/ws-session";
import { shutdownClose } from "../src/adapter/ws-shutdown";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { createFakeSocket } from "./helpers/fake-socket";

afterEach(() => {
  vi.useRealTimers();
});

const OK: WSMessage = { type: "auth_ok", id: "a1", v: 2, connectionId: "c1" };

describe("createSession", () => {
  it("lets the connection in once, auth_ok its first frame", () => {
    const socket = createFakeSocket();
    const session = createSession(socket);

    session.admit(OK);
    session.admit({ ...OK, id: "again" });

    expect(session.admitted).toBe(true);
    expect(socket.sent).toEqual([OK]);
  });

  it("says why with auth_error before it closes one not let in, with the frame's id", () => {
    const socket = createFakeSocket();
    const session = createSession(socket);

    session.close({ kind: "auth-refused", failure: { code: 4403, message: "Banned" }, id: "a1" });

    expect(socket.sent).toEqual([
      { type: "auth_error", id: "a1", error: { code: 4403, message: "Banned" }, v: 2 },
    ]);
    expect(socket.closed).toMatchObject({ code: 4403, reason: "Banned" });
  });

  it("says why with disconnect before it closes one let in, once, for the first reason", () => {
    const socket = createFakeSocket();
    const close = vi.spyOn(socket, "close");
    const session = createSession(socket);
    session.admit(OK);

    session.close({ kind: "heartbeat-timeout" });
    session.close({ kind: "internal" });

    expect(socket.sent.slice(1)).toEqual([
      { type: "disconnect", code: 4408, reason: "Heartbeat timeout" },
    ]);
    expect(close.mock.calls).toEqual([[4408, "Heartbeat timeout"]]);
    expect(session.closing).toBe(true);
  });

  it("tells a stopping server's clients when to come back, before auth_ok and after", () => {
    const [before, after] = [createFakeSocket(), createFakeSocket()];
    const admitted = createSession(after);
    admitted.admit(OK);

    createSession(before).close({ kind: "shutdown", retryAfterMs: 1_200 });
    admitted.close({ kind: "shutdown", retryAfterMs: 800 });

    expect(before.sent).toEqual([
      {
        type: "auth_error",
        error: { code: 1001, message: "Server shutting down" },
        v: 2,
        retryAfterMs: 1_200,
      },
    ]);
    expect(after.sent.at(-1)).toEqual({
      type: "disconnect",
      code: 1001,
      reason: "Server shutting down",
      retryAfterMs: 800,
    });
  });

  it("refuses a code no socket can send, before closing anything", () => {
    const socket = createFakeSocket();
    const session = createSession(socket);

    expect(() => session.close({ kind: "application", code: 1006, reason: "x" })).toThrow(
      TypeError,
    );
    expect(socket.closed).toBeUndefined();
    session.close({ kind: "application", code: 4001, reason: "Signed out" });
    expect(socket.closed).toMatchObject({ code: 4001, reason: "Signed out" });
  });

  it("cuts a reason longer than a close frame carries, in the frame before it too", () => {
    const socket = createFakeSocket();
    const session = createSession(socket);
    session.admit(OK);

    session.close({ kind: "application", code: 4001, reason: "é".repeat(100) });

    const reason = socket.closed?.reason ?? "";
    expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(123);
    expect(reason.endsWith("…")).toBe(true);
    expect(socket.sent.at(-1)).toEqual({ type: "disconnect", code: 4001, reason });
  });

  it("asks for credentials again and closes at the deadline unless they are renewed", () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();
    const session = createSession(socket);
    session.admit(OK);

    session.requireAuth(1_000);
    expect(socket.sent.at(-1)).toEqual({ type: "reauth_required", timeoutMs: 1_000 });
    vi.advanceTimersByTime(999);
    expect(socket.closed).toBeUndefined();
    vi.advanceTimersByTime(1);

    expect(socket.sent.at(-1)).toEqual({
      type: "disconnect",
      code: 4401,
      reason: "Credentials not renewed in time",
    });
    expect(socket.closed).toMatchObject({ code: 4401, reason: "Credentials not renewed in time" });
  });

  it("answers credentials renewed with auth_ok of their frame's id, and lifts the deadline", () => {
    vi.useFakeTimers();
    const renewed = createFakeSocket();
    const cancelled = createFakeSocket();
    const session = createSession(renewed);
    session.admit(OK);
    session.requireAuth(1_000);
    const cancel = createSession(cancelled).requireAuth(1_000);

    session.credentialsRenewed("r1");
    cancel();
    vi.advanceTimersByTime(2_000);

    expect(renewed.sent.at(-1)).toEqual({ ...OK, id: "r1" });
    expect(renewed.closed).toBeUndefined();
    expect(cancelled.closed).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sets no deadline for a request with none", () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();

    createSession(socket).requireAuth(0);

    expect(socket.sent).toEqual([{ type: "reauth_required", timeoutMs: 0 }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps no timer once the socket closed, and asks nothing of a closed one", () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();
    const session = createSession(socket);
    session.requireAuth(1_000);

    session.dispose();
    session.requireAuth(1_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(socket.sent).toEqual([{ type: "reauth_required", timeoutMs: 1_000 }]);
  });
});

describe("shutdownClose", () => {
  it("draws each connection's pause anew, within the spread", () => {
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.9999);

    expect([shutdownClose(), shutdownClose()]).toEqual([
      { kind: "shutdown", retryAfterMs: 0 },
      { kind: "shutdown", retryAfterMs: 4_999 },
    ]);
    random.mockRestore();
  });
});

describe("closeOf", () => {
  const closes: Array<[SessionClose, number, string]> = [
    [{ kind: "host" }, 4421, "Host not allowed"],
    [{ kind: "origin" }, 4403, "Origin not allowed"],
    [{ kind: "limit" }, 4429, "Too many connections"],
    [{ kind: "evicted" }, 4409, "Replaced by a newer connection"],
    [{ kind: "flood" }, 4429, "Too many messages before the connection was accepted"],
    [{ kind: "version", reason: "The first frame is auth" }, 1002, "The first frame is auth"],
    [{ kind: "no-auth-frame", timeoutMs: 3000 }, 4408, "No auth frame within 3000 ms"],
    [{ kind: "bad-auth-frame", id: "a1" }, 4401, "Invalid auth frame"],
    [
      { kind: "auth-refused", failure: { code: 5000, message: "boom" } },
      4401,
      "Connection rejected",
    ],
    [{ kind: "auth-refused", failure: { code: 4403, message: "Banned" } }, 4403, "Banned"],
    [{ kind: "admission-timeout" }, 1011, "Connection could not be admitted in time"],
    [{ kind: "reauth-refused", failure: { code: 4422, message: "x" } }, 4422, "x"],
    [{ kind: "reauth-timeout" }, 4401, "Credentials not renewed in time"],
    [{ kind: "heartbeat-timeout" }, 4408, "Heartbeat timeout"],
    [{ kind: "slow-consumer" }, 1013, "Slow consumer"],
    [{ kind: "internal" }, 1011, "Internal error"],
    [{ kind: "shutdown", retryAfterMs: 0 }, 1001, "Server shutting down"],
    [{ kind: "application", code: 4001, reason: "Signed out" }, 4001, "Signed out"],
  ];

  it.each(closes)("closes for %o with %i", (why, code, reason) => {
    expect(closeOf(why)).toEqual({ code, reason });
  });
});

describe("noticeOf", () => {
  it("answers refused credentials sent again with auth_error, though the connection was let in", () => {
    const why: SessionClose = {
      kind: "reauth-refused",
      failure: { code: 4401, message: "Credentials rejected" },
      id: "r2",
    };

    expect(noticeOf(why, closeOf(why), true)).toEqual({
      type: "auth_error",
      id: "r2",
      error: { code: 4401, message: "Credentials rejected" },
      v: 2,
    });
  });
});

describe("isSendableCloseCode", () => {
  it("takes what an endpoint may send, and none of what it may not", () => {
    const sendable = [1000, 1001, 1003, 1007, 1011, 1012, 1013, 1014, 3000, 4401, 4999];
    const not = [999, 1004, 1005, 1006, 1015, 2000, 2999, 5000, 4401.5, Number.NaN];

    expect(sendable.filter(isSendableCloseCode)).toEqual(sendable);
    expect(not.filter(isSendableCloseCode)).toEqual([]);
  });
});

describe("closeReason", () => {
  it("leaves a reason that fits as it is", () => {
    expect(closeReason("Signed out")).toBe("Signed out");
    expect(closeReason("a".repeat(123))).toBe("a".repeat(123));
  });

  it("cuts at a character, never through one, whatever the text", () => {
    const characters = ["a", "é", "€", "𝄞", "—"];
    for (let length = 100; length < 160; length++) {
      for (const character of characters) {
        const reason = closeReason(character.repeat(length));
        const bytes = new TextEncoder().encode(reason);
        expect(bytes.length).toBeLessThanOrEqual(123);
        expect(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toBe(reason);
      }
    }
  });
});
