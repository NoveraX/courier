/**
 * A connection's session: closed in one place, once, with the code its
 * dialect gives the reason; and the deadline of credentials asked for
 * again, which closes it when they are not renewed in time.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeReason } from "../src/adapter/close-reason";
import { isSendableCloseCode, type SessionClose, V1_DIALECT } from "../src/adapter/ws-dialect";
import { createSession } from "../src/adapter/ws-session";
import { createFakeSocket } from "./helpers/fake-socket";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSession", () => {
  it("closes the socket once, with the code its dialect gives the first reason", () => {
    const socket = createFakeSocket();
    const close = vi.spyOn(socket, "close");
    const session = createSession(socket, V1_DIALECT);

    session.close({ kind: "heartbeat-timeout" });
    session.close({ kind: "internal" });

    expect(close.mock.calls).toEqual([[4408, "Heartbeat timeout"]]);
    expect(session.closing).toBe(true);
  });

  it("refuses a code no socket can send, before closing anything", () => {
    const socket = createFakeSocket();
    const session = createSession(socket, V1_DIALECT);

    expect(() => session.close({ kind: "application", code: 1006, reason: "x" })).toThrow(
      TypeError,
    );
    expect(socket.closed).toBeUndefined();
    session.close({ kind: "application", code: 4001, reason: "Signed out" });
    expect(socket.closed).toMatchObject({ code: 4001, reason: "Signed out" });
  });

  it("cuts a reason longer than a close frame carries", () => {
    const socket = createFakeSocket();
    const session = createSession(socket, V1_DIALECT);

    session.close({ kind: "application", code: 4001, reason: "é".repeat(100) });

    const reason = socket.closed?.reason ?? "";
    expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(123);
    expect(reason.endsWith("…")).toBe(true);
  });

  it("asks for credentials again and closes at the deadline unless they are renewed", () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();
    const session = createSession(socket, V1_DIALECT);

    session.requireAuth(1_000);
    expect(socket.sent).toEqual([{ type: "auth_required" }]);
    vi.advanceTimersByTime(999);
    expect(socket.closed).toBeUndefined();
    vi.advanceTimersByTime(1);

    expect(socket.closed).toMatchObject({
      code: 4401,
      reason: "Auth timeout — credentials not sent again",
    });
  });

  it("lifts the deadline once the credentials are renewed, or the deadline is cancelled", () => {
    vi.useFakeTimers();
    const renewed = createFakeSocket();
    const cancelled = createFakeSocket();
    const session = createSession(renewed, V1_DIALECT);
    session.requireAuth(1_000);
    const cancel = createSession(cancelled, V1_DIALECT).requireAuth(1_000);

    session.credentialsRenewed();
    cancel();
    vi.advanceTimersByTime(2_000);

    expect(renewed.closed).toBeUndefined();
    expect(cancelled.closed).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sets no deadline for a request with none", () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();

    createSession(socket, V1_DIALECT).requireAuth(0);

    expect(socket.sent).toEqual([{ type: "auth_required" }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps no timer once the socket closed, and asks nothing of a closed one", () => {
    vi.useFakeTimers();
    const socket = createFakeSocket();
    const session = createSession(socket, V1_DIALECT);
    session.requireAuth(1_000);

    session.dispose();
    session.requireAuth(1_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(socket.sent).toEqual([{ type: "auth_required" }]);
  });
});

describe("V1_DIALECT", () => {
  const closes: Array<[SessionClose, number, string]> = [
    [{ kind: "host" }, 4421, "Host not allowed"],
    [{ kind: "origin" }, 4403, "Origin not allowed"],
    [{ kind: "limit" }, 4429, "Too many connections"],
    [{ kind: "flood" }, 4429, "Too many messages before the connection was accepted"],
    [
      { kind: "auth-refused", failure: { code: 5000, message: "boom" } },
      4401,
      "Connection rejected",
    ],
    [{ kind: "auth-refused", failure: { code: 4403, message: "Banned" } }, 4403, "Banned"],
    [{ kind: "admission-timeout" }, 1011, "Connection could not be admitted in time"],
    [{ kind: "reauth-refused", failure: { code: 4422, message: "x" } }, 4422, "x"],
    [{ kind: "reauth-timeout" }, 4401, "Auth timeout — credentials not sent again"],
    [{ kind: "heartbeat-timeout" }, 4408, "Heartbeat timeout"],
    [{ kind: "slow-consumer" }, 4008, "Slow consumer"],
    [{ kind: "internal" }, 1011, "Internal error"],
    [{ kind: "application", code: 4001, reason: "Signed out" }, 4001, "Signed out"],
  ];

  it.each(closes)("closes for %o with %i", (why, code, reason) => {
    expect(V1_DIALECT.closeOf(why)).toEqual({ code, reason });
  });

  it("asks for credentials with auth_required, and takes them with an auth frame of their id", () => {
    expect(V1_DIALECT.reauthRequest(30_000)).toEqual({ type: "auth_required" });
    expect(V1_DIALECT.reauthAccepted("r1")).toEqual({ type: "auth", id: "r1" });
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
