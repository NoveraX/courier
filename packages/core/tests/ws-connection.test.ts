import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import type { WSClientSocket, WSConnectionConfig } from "../src/realtime/ws/ws-types";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket implements WSClientSocket {
  static instances: MockWebSocket[] = [];

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;
  bufferedAmount = 0;

  sent: string[] = [];
  closed = false;

  constructor(
    public url: string,
    public protocols?: string[],
    public headers?: Readonly<Record<string, string>>,
  ) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.closed = true;
    this.readyState = 3;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  simulateClose(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

function mockFactory(
  url: string,
  protocols?: string[],
  headers?: Readonly<Record<string, string>>,
): WSClientSocket {
  return new MockWebSocket(url, protocols, headers);
}

function createConfig(overrides?: Partial<WSConnectionConfig>): WSConnectionConfig {
  return {
    url: "ws://test/ws",
    socketFactory: mockFactory,
    heartbeat: { intervalMs: 100_000, timeoutMs: 50_000 },
    ...overrides,
  };
}

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createWSConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects and transitions to connected on open", () => {
    const statuses: string[] = [];
    const conn = createWSConnection(
      createConfig({
        onStatusChange: (s) => statuses.push(s),
      }),
    );

    expect(conn.status).toBe("connecting");
    lastWs().simulateOpen();
    expect(conn.status).toBe("connected");
    expect(statuses).toContain("connected");
    conn.close();
  });

  it("sends subscribe message on topic subscription when connected", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    conn.subscribe("chat:room", vi.fn<(payload: unknown) => void>());

    const sent = lastWs().sent;
    const subMsg = sent.find((s) => s.includes('"subscribe"'));
    expect(subMsg).toBeDefined();
    expect(JSON.parse(subMsg!).topic).toBe("chat:room");
    conn.close();
  });

  it("dispatches incoming data to topic handler", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    const handler = vi.fn<(payload: unknown) => void>();
    conn.subscribe("chat:room", handler);

    lastWs().simulateMessage(
      encodeMessage({
        type: "data",
        topic: "chat:room",
        payload: { text: "hello" },
      }),
    );

    expect(handler).toHaveBeenCalledWith({ text: "hello" });
    conn.close();
  });

  it("sends unsubscribe on topic unsub", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    const unsub = conn.subscribe("chat:room", vi.fn<(payload: unknown) => void>());
    lastWs().sent.length = 0; // clear subscribe message
    unsub();

    const unsubMsg = lastWs().sent.find((s) => s.includes('"unsubscribe"'));
    expect(unsubMsg).toBeDefined();
    conn.close();
  });

  it("queues messages while connecting and drains on open", () => {
    const conn = createWSConnection(createConfig());

    conn.send("chat:room", { text: "buffered" });
    expect(lastWs().sent).toHaveLength(0);

    lastWs().simulateOpen();

    // After open: subscribe messages + buffered message
    const msgSent = lastWs().sent.find((s) => s.includes('"buffered"'));
    expect(msgSent).toBeDefined();
    conn.close();
  });

  it("reconnects on abnormal close (1006)", () => {
    const conn = createWSConnection(createConfig({ backoff: { initialMs: 100, jitter: false } }));
    lastWs().simulateOpen();

    lastWs().simulateClose(1006);
    expect(conn.status).toBe("reconnecting");

    vi.advanceTimersByTime(100);
    // New WebSocket instance created
    expect(MockWebSocket.instances).toHaveLength(2);
    conn.close();
  });

  it("keeps backing off while the server closes each socket before saying anything", () => {
    const conn = createWSConnection(createConfig({ backoff: { initialMs: 100, jitter: false } }));
    lastWs().simulateOpen();
    lastWs().simulateClose(1011);
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);

    lastWs().simulateOpen();
    lastWs().simulateClose(1011);
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(3);
    conn.close();
  });

  it("backs off afresh once the server has answered on the socket", () => {
    const conn = createWSConnection(createConfig({ backoff: { initialMs: 100, jitter: false } }));
    lastWs().simulateOpen();
    lastWs().simulateClose(1011);
    vi.advanceTimersByTime(100);

    lastWs().simulateOpen();
    lastWs().simulateMessage(encodeMessage({ type: "ping" }));
    lastWs().simulateClose(1011);
    vi.advanceTimersByTime(100);

    expect(MockWebSocket.instances).toHaveLength(3);
    conn.close();
  });

  it("does not reconnect on normal close (1000)", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    lastWs().simulateClose(1000);
    expect(conn.status).toBe("disconnected");
    expect(MockWebSocket.instances).toHaveLength(1);
    conn.close();
  });

  it("re-subscribes to topics after reconnect", () => {
    const conn = createWSConnection(createConfig({ backoff: { initialMs: 50, jitter: false } }));
    lastWs().simulateOpen();
    conn.subscribe("chat:room", vi.fn<(payload: unknown) => void>());

    lastWs().simulateClose(1006);
    vi.advanceTimersByTime(50);

    const newWs = lastWs();
    newWs.simulateOpen();

    const subMsgs = newWs.sent.filter((s) => s.includes('"subscribe"'));
    expect(subMsgs).toHaveLength(1);
    expect(JSON.parse(subMsgs[0]!).topic).toBe("chat:room");
    conn.close();
  });

  it("handles pong messages (heartbeat)", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    // Should not throw
    lastWs().simulateMessage(encodeMessage({ type: "pong" }));
    conn.close();
  });

  it("graceful close transitions to disconnected", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    conn.close();

    expect(conn.status).toBe("disconnected");
  });

  it("drops messages when backpressure is high", () => {
    const conn = createWSConnection(createConfig({ maxBufferedAmount: 100 }));
    lastWs().simulateOpen();

    (lastWs() as MockWebSocket).bufferedAmount = 200;
    conn.send("chat:room", { big: true });

    // The message with payload should not appear (only subscribe messages before buffered was set)
    const msgWithPayload = lastWs().sent.find((s) => s.includes('"big"'));
    expect(msgWithPayload).toBeUndefined();
    conn.close();
  });

  it("opens with its credentials: headers on the handshake, the auth frame first, none in the URL", async () => {
    const conn = createWSConnection(
      createConfig({
        credentials: () =>
          Promise.resolve({
            handshake: { authorization: "Bearer secret123" },
            frame: { auth: { tenant: "t1" } },
          }),
      }),
    );
    conn.subscribe("chat:room", () => {});

    await vi.advanceTimersByTimeAsync(0);
    lastWs().simulateOpen();

    expect(lastWs().url).toBe("ws://test/ws");
    expect(lastWs().headers).toEqual({ authorization: "Bearer secret123" });
    expect(JSON.parse(lastWs().sent[0]!)).toEqual({
      type: "auth",
      payload: { auth: { tenant: "t1" } },
    });
    expect(JSON.parse(lastWs().sent[1]!)).toMatchObject({ type: "subscribe", topic: "chat:room" });
    conn.close();
  });

  it("asks for its credentials anew before it reconnects", async () => {
    let issued = 0;
    const conn = createWSConnection(
      createConfig({ credentials: () => ({ frame: { auth: { token: `t${++issued}` } } }) }),
    );
    lastWs().simulateOpen();
    lastWs().simulateClose(1006);

    await vi.advanceTimersByTimeAsync(60_000);
    lastWs().simulateOpen();

    expect(JSON.parse(lastWs().sent[0]!)).toEqual({
      type: "auth",
      payload: { auth: { token: "t2" } },
    });
    conn.close();
  });

  it("tries again, as after a drop, when its credentials cannot be had", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let attempts = 0;
    const conn = createWSConnection(
      createConfig({
        credentials: () => {
          attempts += 1;
          if (attempts === 1) return Promise.reject(new Error("token service down"));
          return { frame: { auth: { token: "t" } } };
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(60_000);

    expect(attempts).toBe(2);
    expect(MockWebSocket.instances).toHaveLength(1);
    conn.close();
  });

  it("sends an empty auth frame first when it has no credentials", () => {
    const conn = createWSConnection(createConfig());
    lastWs().simulateOpen();

    expect(JSON.parse(lastWs().sent[0]!)).toEqual({ type: "auth", payload: {} });
    conn.close();
  });
});
