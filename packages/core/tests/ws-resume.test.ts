/**
 * @vitest-environment jsdom
 *
 * A page whose network comes back, or that is shown again, reconnects its
 * socket at once rather than waiting out the backoff — up to 30 seconds by
 * default — and an application can reconnect it at once itself. A wait the
 * server asked for is kept: a server at capacity is called back a little at
 * random after it, however often the page says it is back, and the
 * refusals in a row stay counted. A socket that still reads as open when
 * the network comes back is checked: a dead one sends no close event, and
 * only the server's silence gave it away.
 *
 * The sockets here are stand-ins the test opens, admits and fails, under
 * fake timers for the waits: no network is involved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryOf } from "../src/realtime/retry-of";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSClientSocket, WSConnection, WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { admission } from "./helpers/admission";

/** A socket the test drives: it opens, answers, fails and receives as told. */
class StandInSocket implements WSClientSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen: WSClientSocket["onopen"] = null;
  onmessage: WSClientSocket["onmessage"] = null;
  onclose: WSClientSocket["onclose"] = null;
  onerror: WSClientSocket["onerror"] = null;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** The socket opens and the server admits it, with its usual heartbeat: 25 s, and 10 to answer. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({
      data: admission(this.sent, { heartbeat: { intervalMs: 25_000, timeoutMs: 10_000 } }),
    });
  }

  /** The connection drops, as a refused or lost one closes: 1006. */
  fail(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "" });
  }

  /** The socket opens and the server refuses it over its connection limit, naming a wait of 10 s. */
  refuse(): void {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({
      data: JSON.stringify({
        type: "auth_error",
        error: { code: 4429, message: "Too many connections" },
        v: 2,
        retryAfterMs: 10_000,
      }),
    });
  }
}

let sockets: StandInSocket[] = [];
let connection: WSConnection | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  sockets = [];
});

afterEach(() => {
  connection?.close();
  connection = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function open(config: Partial<WSConnectionConfig> = {}): WSConnection {
  connection = createWSConnection({
    url: "wss://realtime.example.com/ws",
    socketFactory: () => {
      const socket = new StandInSocket();
      sockets.push(socket);
      return socket;
    },
    ...config,
  });
  return connection;
}

function lastSocket(): StandInSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error("no socket was opened");
  return socket;
}

/** Fail every socket until the backoff has grown to its 30-second cap. */
async function failUntilTheLongestWait(conn: WSConnection): Promise<number> {
  for (let attempt = 0; attempt < 6; attempt++) {
    lastSocket().fail();
    await vi.advanceTimersByTimeAsync(30_000);
  }
  lastSocket().fail();
  return retryOf(conn)?.retryIn ?? 0;
}

function show(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("a connection waiting out its backoff", () => {
  it("waits up to 30 seconds by default", async () => {
    const conn = open({ backoff: { jitter: false } });

    const waiting = await failUntilTheLongestWait(conn);

    expect(waiting).toBe(30_000);
    expect(conn.status).toBe("reconnecting");
  });

  it("reconnects within a second when the network comes back", async () => {
    const conn = open();
    await failUntilTheLongestWait(conn);
    const before = sockets.length;

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sockets.length).toBe(before + 1);
  });

  it("reconnects at once when the page is shown again", async () => {
    const conn = open();
    await failUntilTheLongestWait(conn);
    const before = sockets.length;

    show();

    expect(sockets.length).toBe(before + 1);
  });

  it("reconnects at once when the application asks, once however often it asks", async () => {
    const conn = open();
    await failUntilTheLongestWait(conn);
    const before = sockets.length;

    conn.reconnect();
    conn.reconnect();
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets.length, "one socket for two calls").toBe(before + 1);
  });

  it("waits its backoff out when told not to act on the page's signals", async () => {
    /* A wait it knows, 30 s: one drawn at random may end within the second the test waits. */
    const conn = open({ reconnectOnResume: false, backoff: { jitter: false } });
    await failUntilTheLongestWait(conn);
    const before = sockets.length;

    window.dispatchEvent(new Event("online"));
    show();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sockets.length).toBe(before);
  });
});

describe("a connection waiting out the wait its server asked for", () => {
  /* Without jitter the first wait is the server's 10 s and the backoff's 1 s. */
  const atTheLimit = () => open({ backoff: { jitter: false } });

  it("is not brought back before it when its window gets focus", async () => {
    atTheLimit();
    lastSocket().refuse();
    await vi.advanceTimersByTimeAsync(1_000);

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(8_999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_001);

    expect(sockets).toHaveLength(2);
  });

  it("is not brought back before it when the network comes back, and counts its refusals", async () => {
    const conn = atTheLimit();
    lastSocket().refuse();
    await vi.advanceTimersByTimeAsync(11_000);
    lastSocket().refuse();

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(sockets).toHaveLength(3);
    lastSocket().refuse();

    expect(retryOf(conn)?.retryIn, "the third refusal waits 10 s and 4").toBe(14_000);
  });

  it("is not brought back before it however often its tab is shown", async () => {
    atTheLimit();
    lastSocket().refuse();

    for (let shown = 0; shown < 5; shown++) {
      await vi.advanceTimersByTimeAsync(1_100);
      show();
    }
    await vi.advanceTimersByTimeAsync(4_000);

    expect(sockets).toHaveLength(1);
  });
});

describe("a connection that reads as open when the network comes back", () => {
  it("checks the socket is alive rather than waiting for the server's silence", async () => {
    open();
    lastSocket().open();
    lastSocket().sent.length = 0;

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(lastSocket().sent).toContain(JSON.stringify({ type: "ping" }));
  });

  it("gives a socket that does not answer up within five seconds, and reconnects", async () => {
    const conn = open({ backoff: { initialMs: 100, jitter: false } });
    lastSocket().open();
    const before = sockets.length;

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(conn.status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(100);

    expect(sockets.length).toBe(before + 1);
  });

  it("keeps a socket that answers", async () => {
    const conn = open();
    lastSocket().open();

    window.dispatchEvent(new Event("online"));
    lastSocket().onmessage?.({ data: '{"type":"pong"}' });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(conn.status).toBe("connected");
  });
});
