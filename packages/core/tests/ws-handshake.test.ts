/**
 * How a connection reads what a server answers its `auth`, on a socket the
 * test speaks for the server: `auth_ok` admits it, with the heartbeat the
 * socket is watched by and the largest message the server takes; the frame
 * before a close says why, and the client acts on that code; and a first
 * frame that answers no `auth` comes from a server of another version.
 *
 * What a real server answers is checked against one in the admission tests;
 * here are the answers no test server gives on demand — another version, a
 * code with a wait, a heartbeat of the test's choosing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, ConnectionError } from "../src/realtime/errors";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSClientSocket, WSConnection, WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { type AdmissionOptions, admission } from "./helpers/admission";

/** A socket the test speaks for the server on. */
class ServerSide implements WSClientSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen: WSClientSocket["onopen"] = null;
  onmessage: WSClientSocket["onmessage"] = null;
  onclose: WSClientSocket["onclose"] = null;
  onerror: WSClientSocket["onerror"] = null;
  readonly sent: string[] = [];
  closedWith: { code?: number | undefined; reason?: string | undefined } | undefined;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  /** The server sends a frame. */
  says(frame: unknown): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }

  admit(options?: AdmissionOptions): void {
    this.says(admission(this.sent, options));
  }

  /** The socket closes, as the server or the network closed it. */
  closes(code: number, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  frames(): Array<Record<string, unknown>> {
    return this.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>);
  }
}

let sockets: ServerSide[] = [];
let connection: WSConnection | undefined;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance"],
    shouldClearNativeTimers: true,
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  sockets = [];
});

afterEach(() => {
  connection?.close();
  connection = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function connect(config: Partial<WSConnectionConfig> = {}): WSConnection {
  connection = createWSConnection({
    url: "ws://test/ws",
    socketFactory: () => {
      const socket = new ServerSide();
      sockets.push(socket);
      return socket;
    },
    backoff: { initialMs: 1_000, jitter: false },
    reconnectOnResume: false,
    ...config,
  });
  return connection;
}

function socket(): ServerSide {
  const last = sockets.at(-1);
  if (!last) throw new Error("no socket was opened");
  return last;
}

/** The connection, its socket open and its auth sent: what the server answers is up to the test. */
function opened(config?: Partial<WSConnectionConfig>): WSConnection {
  const conn = connect(config);
  socket().open();
  return conn;
}

describe("a server's answer to the first auth", () => {
  it("is asked for with the protocol's version, and the subscriptions follow at once", () => {
    const conn = connect();
    conn.subscribe("api.chat.room", () => undefined);
    socket().open();

    expect(socket().frames()).toEqual([
      { type: "auth", v: 2, id: "a1", payload: {} },
      expect.objectContaining({ type: "subscribe", topic: "api.chat.room" }),
    ]);
  });

  it("admits the connection with auth_ok of the same id, named as the server names it", () => {
    const conn = opened();

    socket().admit({ connectionId: "c_7f3k" });

    expect(conn.state).toEqual({ phase: "open", connectionId: "c_7f3k" });
  });

  it.each([
    ["a frame no server of this version sends first", { type: "subscribed", topic: "t", id: "s" }],
    ["auth_ok for another auth", { ...JSON.parse(admission(['{"type":"auth","id":"a9"}'])) }],
    ["a kind of frame the client does not know", { type: "auth_required" }],
    ["a message that is no frame", "{oops"],
  ])("takes %s for a server of another version: it drops the socket and waits", (_what, frame) => {
    const conn = opened();

    socket().says(frame);

    expect(conn.state).toMatchObject({
      phase: "reconnecting",
      retryIn: 1_000,
      cause: { kind: "mismatch" },
    });
    expect(socket().closedWith).toEqual({ code: 1002, reason: "Protocol mismatch" });
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
  });

  it("waits to reconnect to a server older than itself, which a rollout replaces", () => {
    const conn = opened();

    socket().says({
      type: "auth_error",
      error: { code: 1002, message: "Protocol version 1 is spoken here, not 2" },
      v: 1,
    });

    expect(conn.state).toMatchObject({
      phase: "reconnecting",
      cause: { kind: "closed", code: 1002, reason: "Protocol version 1 is spoken here, not 2" },
    });
  });

  it.each([
    [3, "a newer server: the page has to be loaded again"],
    [2, "a server of its own version: its auth frame was broken"],
  ])("gives up on 1002 from server version %i (%s), and does not reconnect", (v) => {
    const conn = opened();

    socket().says({
      type: "auth_error",
      error: { code: 1002, message: "Protocol version 2 required: reload the page" },
      v,
    });
    vi.advanceTimersByTime(60_000);

    expect(conn.state.phase).toBe("failed");
    const { state } = conn;
    expect(state.phase === "failed" && state.error).toBeInstanceOf(ConnectionError);
    expect(state.phase === "failed" && state.error.message).toBe(
      "Protocol version 2 required: reload the page",
    );
    expect(sockets).toHaveLength(1);
  });

  it("comes back no sooner than the wait the server asked for", () => {
    const conn = opened();

    socket().says({
      type: "auth_error",
      error: { code: 4429, message: "Too many connections" },
      v: 2,
      retryAfterMs: 1_500,
    });

    expect(conn.state).toMatchObject({ phase: "reconnecting", retryIn: 2_500 });
    vi.advanceTimersByTime(2_499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
  });

  it("takes the code from the frame before the close, whatever the close itself says", () => {
    const conn = opened();

    socket().says({
      type: "auth_error",
      error: { code: 4403, message: "Origin not allowed" },
      v: 2,
    });
    socket().closes(1006);

    expect(conn.state).toMatchObject({ phase: "failed", error: { code: 4403 } });
  });

  it("asks for its credentials anew when the server refuses them, as after a 4401 close", async () => {
    const tokens = ["stale", "fresh"];
    const conn = opened({ credentials: () => ({ frame: { auth: { token: tokens.shift() } } }) });
    await vi.advanceTimersByTimeAsync(0);
    socket().open();

    socket().says({ type: "auth_error", error: { code: 4401, message: "Expired" }, v: 2 });
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    socket().admit();

    expect(conn.status).toBe("connected");
    expect(socket().frames()[0]).toMatchObject({ v: 2, payload: { auth: { token: "fresh" } } });
  });
});

describe("an admitted connection", () => {
  it("takes the socket for dead once nothing came for the server's ping interval and its timeout", () => {
    const conn = opened();
    socket().admit({ heartbeat: { intervalMs: 3_000, timeoutMs: 1_000 } });

    vi.advanceTimersByTime(3_999);
    expect(conn.status).toBe("connected");
    vi.advanceTimersByTime(1);

    expect(conn.state).toMatchObject({ phase: "reconnecting", cause: { kind: "silent" } });
  });

  it("holds messages to the largest the server takes, once it said", () => {
    const conn = opened();
    socket().admit({ maxMessageSize: 300 });
    const errors: unknown[] = [];
    conn.subscribe("api.chat.room", { data: () => undefined, error: (e) => errors.push(e) });
    socket().says({ type: "subscribed", id: "sub-1", topic: "api.chat.room", seq: 0, epoch: "e" });

    /* The frame adds 55 characters to the message: 203 and 305 in all. */
    expect(conn.send("api.chat.room", "x".repeat(148))).toBe(true);
    expect(conn.send("api.chat.room", "x".repeat(250))).toBe(false);
    expect(errors).toEqual([expect.objectContaining({ code: 4413 })]);
  });

  it("holds messages to the protocol's 64 KiB until a server has said", () => {
    const conn = opened();

    expect(conn.send("api.chat.room", "x".repeat(60_000))).toBe(true);
    expect(conn.send("api.chat.room", "x".repeat(70_000))).toBe(false);
  });

  it("sends its credentials again when the server asks, under a new id and without the version", async () => {
    let issued = 0;
    const conn = opened({ credentials: () => ({ frame: { auth: { token: `t${++issued}` } } }) });
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    socket().admit();

    socket().says({ type: "reauth_required", timeoutMs: 30_000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(conn.state.phase).toBe("reauthenticating");
    expect(socket().frames().at(-1)).toEqual({
      type: "auth",
      id: "a2",
      payload: { auth: { token: "t2" } },
    });
    socket().admit();
    expect(conn.state).toEqual({ phase: "open", connectionId: "c1" });
  });

  it("ends with the server's reason when the credentials sent again are refused", async () => {
    const conn = opened({ credentials: () => ({ frame: { auth: { token: "t1" } } }) });
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    socket().admit();
    socket().says({ type: "reauth_required", timeoutMs: 0 });
    await vi.advanceTimersByTimeAsync(0);

    socket().says({
      type: "auth_error",
      id: "a2",
      error: { code: 4401, message: "Credentials rejected" },
      v: 2,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(conn.state.phase).toBe("failed");
    const { state } = conn;
    expect(state.phase === "failed" && state.error).toBeInstanceOf(AuthError);
    expect(state.phase === "failed" && state.error.message).toBe("Credentials rejected");
  });

  it("reconnects after a server's shutdown no sooner than the wait it gave", () => {
    const conn = opened();
    socket().admit();

    socket().says({
      type: "disconnect",
      code: 1001,
      reason: "Server shutting down",
      retryAfterMs: 2_380,
    });

    expect(conn.state).toMatchObject({
      phase: "reconnecting",
      retryIn: 3_380,
      cause: { kind: "closed", code: 1001, reason: "Server shutting down" },
    });
    expect(socket().closedWith?.code).toBe(1000);
  });

  it("does not come back once replaced by a newer connection of its user", () => {
    const conn = opened();
    socket().admit();

    socket().says({ type: "disconnect", code: 4409, reason: "Replaced by a newer connection" });
    vi.advanceTimersByTime(60_000);

    expect(conn.state).toMatchObject({ phase: "failed", error: { code: 4409 } });
    expect(sockets).toHaveLength(1);
  });

  it("ignores a kind of frame it does not know, and stays open", () => {
    const conn = opened();
    socket().admit();

    socket().says({ type: "presence_diff", topic: "t" });

    expect(conn.status).toBe("connected");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
