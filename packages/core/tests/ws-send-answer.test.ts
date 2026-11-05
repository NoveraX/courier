/**
 * What a message sent on a WebSocket connection answers: whether it went out
 * or waits to. One that can do neither — the connection closed, its queue or
 * the socket's buffer full — answers false with a warning, so a lost message
 * never passes for a sent one. A message goes out once the server has
 * admitted the socket, not as soon as it opens.
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSClientSocket, WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { admission } from "./helpers/admission";

class Socket implements WSClientSocket {
  static last: Socket | undefined;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];

  constructor() {
    Socket.last = this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  /** The server admits the socket: `auth_ok`, its answer to the client's auth frame. */
  admit(): void {
    this.onmessage?.(new MessageEvent("message", { data: admission(this.sent) }));
  }
}

function connect(overrides?: Partial<WSConnectionConfig>) {
  return createWSConnection({
    url: "ws://test/ws",
    socketFactory: () => new Socket(),
    ...overrides,
  });
}

function socket(): Socket {
  if (!Socket.last) throw new Error("no socket was opened");
  return Socket.last;
}

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function warnings(): string {
  return warn.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");
}

describe("a message sent on a connection", () => {
  it("answers true once handed to the open socket", () => {
    const conn = connect();
    socket().open();
    socket().admit();

    expect(conn.send("chat:room", { text: "now" })).toBe(true);
    expect(socket().sent.some((frame) => frame.includes('"now"'))).toBe(true);
    conn.close();
  });

  it("answers true while it waits in the queue for the socket to open", () => {
    const conn = connect();

    expect(conn.send("chat:room", { text: "soon" })).toBe(true);
    conn.close();
  });

  it("waits until the server admits the socket, then goes out", () => {
    const conn = connect();
    socket().open();

    expect(conn.send("chat:room", { text: "admitted" })).toBe(true);
    expect(socket().sent.some((frame) => frame.includes('"admitted"'))).toBe(false);
    socket().admit();

    expect(socket().sent.some((frame) => frame.includes('"admitted"'))).toBe(true);
    conn.close();
  });

  it("answers false, with a warning, once the connection is closed", () => {
    const conn = connect();
    socket().open();
    conn.close();

    expect(conn.send("chat:room", { text: "late" })).toBe(false);
    expect(warnings()).toContain("Message not sent on chat:room: the connection is closed");
  });

  it("answers false, with a warning, when the queue has no room left", () => {
    const conn = connect({ messageQueue: { maxCount: 1 } });

    expect(conn.send("chat:room", { n: 1 })).toBe(true);
    expect(conn.send("chat:room", { n: 2 })).toBe(false);
    expect(warnings()).toContain("The outbound queue is full: a message on chat:room was not kept");
    conn.close();
  });

  it("answers false, with a warning, when the socket's buffer is full", () => {
    const conn = connect({ maxBufferedAmount: 100 });
    socket().open();
    socket().admit();
    socket().bufferedAmount = 200;

    expect(conn.send("chat:room", { big: true })).toBe(false);
    expect(warnings()).toContain("Message not sent on chat:room: the socket's buffer is full");
    conn.close();
  });
});
