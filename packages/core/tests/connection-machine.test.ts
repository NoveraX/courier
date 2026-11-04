/**
 * The WebSocket connection's state machine, transition by transition: given
 * where the connection stands and what happened, where it stands next and
 * what it does. No timer, clock or socket is involved — the machine reads
 * none — so every row of the table is checked as it is written.
 */
import { describe, expect, it } from "vitest";

import { AuthError, ConnectionError, ForbiddenError } from "../src/realtime/errors";
import { transition } from "../src/realtime/ws/connection-machine";
import type {
  MachineContext,
  MachineEvent,
  MachineState,
} from "../src/realtime/ws/connection-machine-types";

const NOW = 1_000_000;

const ctx = (now = NOW): MachineContext => ({
  now,
  delay: (step, hintMs) => (hintMs ?? 0) + 1000 * 2 ** step,
  spread: () => 400,
  connectTimeoutMs: 15_000,
  authTimeoutMs: 15_000,
  stableMs: 10_000,
});

const connectDeadline = { ms: 15_000, fires: "timeout" } as const;
const authDeadline = { ms: 15_000, fires: "timeout" } as const;

const idle: MachineState = { phase: "idle", failures: 0, authSeq: 0 };
const connecting = (
  over: Partial<Extract<MachineState, { phase: "connecting" }>> = {},
): MachineState => ({
  phase: "connecting",
  failures: 0,
  authSeq: 0,
  refusal: undefined,
  socket: false,
  deadline: connectDeadline,
  ...over,
});
const authenticating: MachineState = {
  phase: "authenticating",
  failures: 0,
  authSeq: 1,
  refusal: undefined,
  authId: "a1",
  fingerprint: "f1",
  deadline: authDeadline,
};
const open = (openedAt = NOW): MachineState => ({
  phase: "open",
  failures: 0,
  authSeq: 1,
  protocol: 1,
  openedAt,
  fingerprint: "f1",
});
const reauthenticating: MachineState = {
  phase: "reauthenticating",
  failures: 0,
  authSeq: 2,
  protocol: 1,
  openedAt: NOW,
  fingerprint: "f1",
  authId: "a2",
  deadline: authDeadline,
};
const reconnecting: MachineState = {
  phase: "reconnecting",
  failures: 3,
  authSeq: 1,
  refusal: undefined,
  retryIn: 4000,
  cause: { kind: "closed", code: 1006, reason: "", opened: true },
  deadline: { ms: 4000, fires: "retry" },
};
const failed: MachineState = {
  phase: "failed",
  failures: 0,
  authSeq: 1,
  error: new ForbiddenError("No"),
};
const closedByServer: MachineState = { phase: "closed", by: "server", failures: 0, authSeq: 1 };
const closedByClient: MachineState = { phase: "closed", by: "client", failures: 0, authSeq: 1 };

const closed = (code: number, reason = "", announced = false): MachineEvent => ({
  type: "closed",
  closure: { code, reason },
  announced,
});

function step(state: MachineState, event: MachineEvent, now = NOW) {
  return transition(state, event, ctx(now));
}

describe("a connection that starts", () => {
  it("asks for its credentials, with a deadline for its socket to open", () => {
    expect(step(idle, { type: "start" })).toEqual({
      state: connecting(),
      effects: [{ type: "ask-credentials" }],
    });
  });

  it("opens its socket with the credentials that came", () => {
    expect(step(connecting(), { type: "credentials", fingerprint: "f1" })).toEqual({
      state: connecting({ socket: true, fingerprint: "f1" }),
      effects: [{ type: "open-socket" }],
    });
  });

  it("keeps the one deadline while its credentials come and its socket opens", () => {
    const { state } = step(connecting(), { type: "credentials", fingerprint: "f1" });

    expect("deadline" in state && state.deadline).toBe(connectDeadline);
  });

  it("sends its auth frame, and its subscriptions after it, once the socket opens", () => {
    expect(step(connecting({ socket: true, fingerprint: "f1" }), { type: "socket-open" })).toEqual({
      state: authenticating,
      effects: [{ type: "send-auth", id: "a1", opening: true }],
    });
  });

  it("is open once the server admits it, and watches the socket", () => {
    expect(step(authenticating, { type: "admitted", protocol: 1 })).toEqual({
      state: open(),
      effects: [{ type: "watch" }, { type: "flush" }],
    });
  });

  it("gives up at once on a socket the platform would not make", () => {
    const error = new ConnectionError("The socket could not be made: Invalid URL");

    expect(step(connecting(), { type: "socket-failed", error })).toEqual({
      state: { phase: "failed", failures: 0, authSeq: 0, error },
      effects: [{ type: "subscriptions-end", error }],
    });
  });
});

describe("an attempt that does not get through", () => {
  it("waits to try again when its credentials cannot be had", () => {
    const error = new Error("token service down");
    const { state, effects } = step(connecting(), { type: "credentials-failed", error });

    expect(state).toMatchObject({
      phase: "reconnecting",
      failures: 1,
      retryIn: 1000,
      cause: { kind: "credentials", error },
    });
    expect(effects).toEqual([]);
  });

  it("takes no failed answer for credentials once its socket is opening", () => {
    const opening = connecting({ socket: true, fingerprint: "f1" });

    expect(step(opening, { type: "credentials-failed", error: new Error("late") })).toEqual({
      state: opening,
      effects: [],
    });
  });

  it("gives up its socket when it does not open in time", () => {
    const { state, effects } = step(connecting({ socket: true, fingerprint: "f1" }), {
      type: "timeout",
    });

    expect(state).toMatchObject({
      phase: "reconnecting",
      cause: { kind: "timeout", waitingFor: "socket" },
    });
    expect(effects).toEqual([{ type: "drop-socket", code: 4100, reason: "Connect timed out" }]);
  });

  it("gives up its socket when the server does not admit it in time", () => {
    const { state, effects } = step(authenticating, { type: "timeout" });

    expect(state).toMatchObject({
      phase: "reconnecting",
      cause: { kind: "timeout", waitingFor: "admission" },
    });
    expect(effects).toEqual([
      { type: "drop-socket", code: 4100, reason: "Admission timed out" },
      { type: "subscriptions-wait" },
    ]);
  });

  it("says a socket that closed before it opened had not opened", () => {
    const { state } = step(connecting({ socket: true, fingerprint: "f1" }), closed(1006));

    expect(state).toMatchObject({
      phase: "reconnecting",
      cause: { kind: "closed", code: 1006, opened: false },
    });
  });

  it("waits longer after each failure in a row", () => {
    const after = (failures: number) => step({ ...authenticating, failures }, closed(1011)).state;

    expect([0, 1, 2].map((failures) => after(failures))).toMatchObject([
      { failures: 1, retryIn: 1000 },
      { failures: 2, retryIn: 2000 },
      { failures: 3, retryIn: 4000 },
    ]);
  });
});

describe("an open connection that drops", () => {
  it("waits to reconnect, its subscriptions waiting for the next socket", () => {
    expect(step(open(), closed(1006))).toEqual({
      state: {
        phase: "reconnecting",
        failures: 1,
        authSeq: 1,
        refusal: undefined,
        retryIn: 1000,
        cause: { kind: "closed", code: 1006, reason: "", opened: true },
        deadline: { ms: 1000, fires: "retry" },
      },
      effects: [{ type: "unwatch" }, { type: "subscriptions-wait", error: undefined }],
    });
  });

  it("starts its backoff over once it stayed open for the stable period", () => {
    const { state } = step({ ...open(NOW - 10_000), failures: 4 }, closed(1006));

    expect(state).toMatchObject({ failures: 0, retryIn: 1000 });
  });

  it("keeps its backoff growing when it dropped before it was stable", () => {
    const { state } = step({ ...open(NOW - 9_999), failures: 4 }, closed(1006));

    expect(state).toMatchObject({ failures: 5, retryIn: 16_000 });
  });

  it("waits no less than the server asked", () => {
    const { state } = step(open(), {
      type: "closed",
      closure: { code: 1001, reason: "", retryAfterMs: 2500 },
      announced: false,
    });

    expect(state).toMatchObject({ phase: "reconnecting", retryIn: 3500 });
  });

  it("tells each subscription of a message lost over the server's frame limit", () => {
    const { effects } = step(open(), closed(1009, "Too big"));

    expect(effects).toEqual([
      { type: "unwatch" },
      {
        type: "subscriptions-wait",
        error: expect.objectContaining({ code: 1009, message: "Too big" }),
      },
    ]);
  });

  it("gives up its socket when it falls silent", () => {
    const { state, effects } = step(open(), { type: "silent", forMs: 35_000 });

    expect(state).toMatchObject({
      phase: "reconnecting",
      cause: { kind: "silent", forMs: 35_000 },
    });
    expect(effects).toEqual([
      { type: "drop-socket", code: 4100, reason: "Server silent" },
      { type: "unwatch" },
      { type: "subscriptions-wait" },
    ]);
  });

  it("lets go of a socket the server said it is closing", () => {
    const { effects } = step(open(), closed(1012, "Restart", true));

    expect(effects[0]).toEqual({ type: "drop-socket", code: 1000, reason: "" });
  });

  it("ends as the server ended it after 1000", () => {
    expect(step(open(), closed(1000))).toEqual({
      state: closedByServer,
      effects: [{ type: "unwatch" }, { type: "subscriptions-end" }],
    });
  });

  it("gives up when the server refuses it for good", () => {
    const { state, effects } = step(open(), closed(4403, "Origin not allowed"));

    expect(state).toMatchObject({ phase: "failed", error: expect.any(ForbiddenError) });
    expect(effects).toEqual([
      { type: "unwatch" },
      { type: "subscriptions-end", error: expect.any(ForbiddenError) },
    ]);
  });
});

describe("credentials the server refuses with 4401", () => {
  it("are asked for anew at once, the subscriptions waiting", () => {
    const { state, effects } = step(open(), closed(4401, "Token expired"));

    expect(state).toMatchObject({
      phase: "connecting",
      socket: false,
      refusal: { fingerprint: "f1", retried: false, error: expect.any(AuthError) },
    });
    expect(effects).toEqual([
      { type: "unwatch" },
      { type: "subscriptions-wait" },
      { type: "ask-credentials" },
    ]);
  });

  it("are tried once more when those asked for anew differ", () => {
    const refused = step(open(), closed(4401, "Token expired")).state;

    const { state, effects } = step(refused, { type: "credentials", fingerprint: "f2" });

    expect(state).toMatchObject({
      phase: "connecting",
      socket: true,
      fingerprint: "f2",
      refusal: { retried: true },
    });
    expect(effects).toEqual([{ type: "open-socket" }]);
  });

  it("end the connection with the server's reason when those asked for anew are the same", () => {
    const refused = step(open(), closed(4401, "Token expired")).state;

    const { state, effects } = step(refused, { type: "credentials", fingerprint: "f1" });

    expect(state).toMatchObject({
      phase: "failed",
      error: { code: 4401, message: "Token expired" },
    });
    expect(effects).toEqual([{ type: "subscriptions-end", error: expect.any(AuthError) }]);
  });

  it("end the connection when the one attempt with other ones is refused too", () => {
    const retried: MachineState = {
      ...authenticating,
      refusal: { fingerprint: "f0", error: new AuthError("Token expired"), retried: true },
    };

    expect(step(retried, closed(4401, "Still expired")).state).toMatchObject({
      phase: "failed",
      error: { code: 4401, message: "Still expired" },
    });
  });

  it("are forgotten once the server admits the connection", () => {
    const retried: MachineState = {
      ...authenticating,
      refusal: { fingerprint: "f0", error: new AuthError("Token expired"), retried: true },
    };

    expect(step(retried, { type: "admitted", protocol: 1 }).state).not.toHaveProperty("refusal");
  });
});

describe("credentials sent again on an open connection", () => {
  it("are asked for when the server asks, the connection staying open", () => {
    expect(step(open(), { type: "renewal-requested" })).toEqual({
      state: {
        ...open(),
        phase: "reauthenticating",
        authSeq: 2,
        authId: "a2",
        deadline: authDeadline,
      },
      effects: [{ type: "ask-credentials" }],
    });
  });

  it("go out as they come, under the renewal's id", () => {
    expect(step(reauthenticating, { type: "credentials", fingerprint: "f2" })).toEqual({
      state: { ...reauthenticating, fingerprint: "f2" },
      effects: [{ type: "send-auth", id: "a2", opening: false }],
    });
  });

  it.each(["renewed", "credentials-failed"] as const)("leave the connection open on %s", (type) => {
    const event: MachineEvent = type === "renewed" ? { type } : { type, error: new Error("x") };

    expect(step(reauthenticating, event)).toEqual({
      state: { ...open(), authSeq: 2 },
      effects: [],
    });
  });

  it("are asked for once at a time", () => {
    expect(step(reauthenticating, { type: "renewal-requested" }).state).toBe(reauthenticating);
  });

  it("give the socket up when the server does not answer them in time", () => {
    expect(step(reauthenticating, { type: "timeout" }).state).toMatchObject({
      phase: "reconnecting",
      cause: { kind: "timeout", waitingFor: "renewal" },
    });
  });
});

describe("reconnect()", () => {
  it("connects at once from a wait, starting the backoff over", () => {
    expect(step(reconnecting, { type: "reconnect" })).toEqual({
      state: connecting({ authSeq: 1 }),
      effects: [{ type: "ask-credentials" }],
    });
  });

  it("drops an open socket for a new one, the subscriptions waiting for it", () => {
    expect(step(open(), { type: "reconnect" })).toEqual({
      state: connecting({ authSeq: 1 }),
      effects: [
        { type: "drop-socket", code: 4000, reason: "Reconnecting" },
        { type: "unwatch" },
        { type: "subscriptions-wait" },
        { type: "ask-credentials" },
      ],
    });
  });

  it.each([
    ["connecting", connecting()],
    ["authenticating", authenticating],
  ])("is the attempt already under way while %s", (_name, state) => {
    expect(step(state, { type: "reconnect" })).toEqual({ state, effects: [] });
  });

  it("tries again after the connection was refused or ended by the server", () => {
    expect(step(failed, { type: "reconnect" }).state).toEqual(connecting({ authSeq: 1 }));
    expect(step(closedByServer, { type: "reconnect" }).state).toEqual(connecting({ authSeq: 1 }));
  });

  it("does nothing once the application closed the connection", () => {
    expect(step(closedByClient, { type: "reconnect" })).toEqual({
      state: closedByClient,
      effects: [],
    });
  });
});

describe("a resume signal", () => {
  it("ends a wait at once when the page is shown again or gets focus", () => {
    for (const signal of ["visible", "pageshow", "focus"] as const) {
      expect(step(reconnecting, { type: "resume", signal }).state).toEqual(
        connecting({ authSeq: 1 }),
      );
    }
  });

  it("shortens a wait to a random moment of the next second when the network is back", () => {
    expect(step(reconnecting, { type: "resume", signal: "online" }).state).toEqual({
      ...reconnecting,
      failures: 0,
      retryIn: 400,
      deadline: { ms: 400, fires: "retry" },
    });
  });

  it("has an open connection checked", () => {
    expect(step(open(), { type: "resume", signal: "online" })).toEqual({
      state: open(),
      effects: [{ type: "probe" }],
    });
  });

  it.each([
    ["connecting", connecting()],
    ["authenticating", authenticating],
    ["failed", failed],
    ["closed", closedByClient],
  ])("does nothing while %s", (_name, state) => {
    expect(step(state, { type: "resume", signal: "online" })).toEqual({ state, effects: [] });
  });
});

describe("close()", () => {
  it.each([
    [
      "an open connection",
      open(),
      [
        { type: "drop-socket", code: 1000, reason: "Client closed" },
        { type: "unwatch" },
        { type: "subscriptions-end" },
      ],
    ],
    [
      "one authenticating",
      authenticating,
      [{ type: "drop-socket", code: 1000, reason: "Client closed" }, { type: "subscriptions-end" }],
    ],
    [
      "one whose socket is opening",
      connecting({ socket: true, fingerprint: "f1" }),
      [{ type: "drop-socket", code: 1000, reason: "Client closed" }, { type: "subscriptions-end" }],
    ],
    ["one asking for its credentials", connecting(), [{ type: "subscriptions-end" }]],
    ["one waiting to reconnect", reconnecting, [{ type: "subscriptions-end" }]],
    ["one refused for good", failed, []],
  ])("ends %s for good", (_name, state, effects) => {
    const result = step(state, { type: "close" });

    expect(result.state).toMatchObject({ phase: "closed", by: "client" });
    expect(result.effects).toEqual(effects);
  });

  it("does nothing twice", () => {
    expect(step(closedByClient, { type: "close" })).toEqual({ state: closedByClient, effects: [] });
  });
});

describe("an event that means nothing where the connection stands", () => {
  const events: MachineEvent[] = [
    { type: "start" },
    { type: "socket-open" },
    { type: "admitted", protocol: 1 },
    { type: "renewed" },
    { type: "retry" },
    { type: "silent", forMs: 1 },
  ];

  it.each([
    ["connecting", connecting()],
    ["reconnecting", reconnecting],
    ["failed", failed],
    ["closed", closedByClient],
  ])("leaves a connection %s as it was", (_name, state) => {
    for (const event of events) {
      if (state.phase === "reconnecting" && event.type === "retry") continue;
      expect(step(state, event)).toEqual({ state, effects: [] });
    }
  });
});
