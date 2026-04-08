import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioHooks } from "../src/studio";
import type { StudioHooks } from "../src/studio/hooks";
import { createMockSSESubscription } from "../src/testing/mock-sse";
import { instrumentSSE, instrumentWSChannel, instrumentWSPush } from "../src/transport/instrument";
import type { ConnectionStatus, WSChannel } from "../src/realtime/types";

// Snapshot original studio hooks so individual tests can mutate without leaking
let originalHooks: StudioHooks;

beforeEach(() => {
  originalHooks = { ...studioHooks };
});

afterEach(() => {
  // Restore — clear any mocks installed by tests
  for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) {
    delete studioHooks[key];
  }
  Object.assign(studioHooks, originalHooks);
});

const META = {
  source: "demo",
  group: "notifications",
  method: "feed",
  transport: "sse" as const,
  mode: "direct" as const,
};

// ---------------------------------------------------------------------------
// instrumentSSE — zero-cost path
// ---------------------------------------------------------------------------

describe("instrumentSSE — zero-cost when studio disconnected", () => {
  it("returns the original subscription when onStreamOpen is undefined", () => {
    delete studioHooks.onStreamOpen;
    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
    });
    const result = instrumentSSE(sub, META);
    expect(result).toBe(sub);
  });
});

// ---------------------------------------------------------------------------
// instrumentSSE — full lifecycle
// ---------------------------------------------------------------------------

describe("instrumentSSE — lifecycle events", () => {
  it("fires onStreamOpen with metadata before iteration starts", async () => {
    const onStreamOpen = vi.fn();
    studioHooks.onStreamOpen = onStreamOpen;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
    });
    instrumentSSE(sub, META);

    expect(onStreamOpen).toHaveBeenCalledTimes(1);
    expect(onStreamOpen.mock.calls[0]?.[0]).toMatchObject({
      source: "demo",
      group: "notifications",
      method: "feed",
      transport: "sse",
      mode: "direct",
    });
    expect(onStreamOpen.mock.calls[0]?.[0].requestId).toMatch(/^req_/);
    expect(typeof onStreamOpen.mock.calls[0]?.[0].timestamp).toBe("number");
  });

  it("forwards requestHeaders when provided", () => {
    const onStreamOpen = vi.fn();
    studioHooks.onStreamOpen = onStreamOpen;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
    });
    instrumentSSE(sub, { ...META, requestHeaders: { Authorization: "Bearer xyz" } });

    expect(onStreamOpen.mock.calls[0]?.[0].requestHeaders).toEqual({ Authorization: "Bearer xyz" });
  });

  it("fires onStreamMessage for each yielded event with seq and dataSize", async () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    studioHooks.onStreamMessage = onStreamMessage;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1, name: "Alice" } };
      yield { data: { id: 2, name: "Bob" } };
      yield { data: { id: 3, name: "Carol" } };
    });
    const wrapped = instrumentSSE(sub, META);

    const events: unknown[] = [];
    for await (const event of wrapped) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(onStreamMessage).toHaveBeenCalledTimes(3);
    expect(onStreamMessage.mock.calls[0]?.[0]).toMatchObject({
      seq: 1,
      // SSE is server→client unidirectional — events with no explicit
      // `event:` field default to "data".
      eventType: "data",
      dataSize: expect.any(Number),
      dataPreview: expect.stringContaining("Alice"),
    });
    expect(onStreamMessage.mock.calls[1]?.[0].seq).toBe(2);
    expect(onStreamMessage.mock.calls[2]?.[0].seq).toBe(3);
  });

  it("preserves user-set SSE `event:` field when present", async () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    studioHooks.onStreamMessage = onStreamMessage;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { tick: 1 }, event: "ping" };
      yield { data: { tick: 2 } };
    });
    const wrapped = instrumentSSE(sub, META);

    for await (const _ of wrapped) {
      // drain
    }

    expect(onStreamMessage.mock.calls[0]?.[0].eventType).toBe("ping");
    expect(onStreamMessage.mock.calls[1]?.[0].eventType).toBe("data");
  });

  it("fires onStreamClose with reason 'complete' when iteration finishes naturally", async () => {
    studioHooks.onStreamOpen = vi.fn();
    studioHooks.onStreamMessage = vi.fn();
    const onStreamClose = vi.fn();
    studioHooks.onStreamClose = onStreamClose;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
      yield { data: { id: 2 } };
    });
    const wrapped = instrumentSSE(sub, META);

    for await (const _ of wrapped) {
      // drain
    }

    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(onStreamClose.mock.calls[0]?.[0]).toMatchObject({
      reason: "complete",
      eventCount: 2,
      totalBytes: expect.any(Number),
      duration: expect.any(Number),
    });
  });

  it("fires onStreamClose with reason 'disconnect' when close() is called", async () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamClose = vi.fn();
    studioHooks.onStreamClose = onStreamClose;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
    });
    const wrapped = instrumentSSE(sub, META);

    wrapped.close();

    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(onStreamClose.mock.calls[0]?.[0].reason).toBe("disconnect");
  });

  it("fires onStreamClose only once even if close() is called multiple times", async () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamClose = vi.fn();
    studioHooks.onStreamClose = onStreamClose;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
    });
    const wrapped = instrumentSSE(sub, META);

    wrapped.close();
    wrapped.close();
    wrapped.close();

    expect(onStreamClose).toHaveBeenCalledTimes(1);
  });

  it("uses the same requestId across open/message/close lifecycle", async () => {
    const onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    const onStreamClose = vi.fn();
    studioHooks.onStreamOpen = onStreamOpen;
    studioHooks.onStreamMessage = onStreamMessage;
    studioHooks.onStreamClose = onStreamClose;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { id: 1 } };
    });
    const wrapped = instrumentSSE(sub, META);

    for await (const _ of wrapped) {
      // drain
    }

    const openId = onStreamOpen.mock.calls[0]?.[0].requestId;
    const msgId = onStreamMessage.mock.calls[0]?.[0].requestId;
    const closeId = onStreamClose.mock.calls[0]?.[0].requestId;

    expect(openId).toBe(msgId);
    expect(msgId).toBe(closeId);
  });

  it("truncates dataPreview to 512 chars", async () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    studioHooks.onStreamMessage = onStreamMessage;

    const longString = "x".repeat(1000);
    const sub = createMockSSESubscription(async function* () {
      yield { data: longString };
    });
    const wrapped = instrumentSSE(sub, META);

    for await (const _ of wrapped) {
      // drain
    }

    const preview = onStreamMessage.mock.calls[0]?.[0].dataPreview as string;
    expect(preview.length).toBeLessThanOrEqual(513); // 512 + ellipsis char
    expect(preview.endsWith("…")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// instrumentWSChannel
// ---------------------------------------------------------------------------

describe("instrumentWSChannel", () => {
  function createMockChannel(): {
    channel: WSChannel<unknown, unknown>;
    emitData: (data: unknown) => void;
    emitStatus: (status: ConnectionStatus) => void;
  } {
    const dataHandlers = new Set<(data: unknown) => void>();
    const statusHandlers = new Set<(s: ConnectionStatus) => void>();
    let status: ConnectionStatus = "connecting";

    const channel: WSChannel<unknown, unknown> = {
      send: vi.fn(),
      close: vi.fn(),
      get status() {
        return status;
      },
      on(event: "data" | "status", handler: never) {
        if (event === "data") {
          dataHandlers.add(handler as never);
          return () => dataHandlers.delete(handler as never);
        }
        statusHandlers.add(handler as never);
        return () => statusHandlers.delete(handler as never);
      },
    } as WSChannel<unknown, unknown>;

    return {
      channel,
      emitData: (data) => {
        for (const h of dataHandlers) h(data);
      },
      emitStatus: (s) => {
        status = s;
        for (const h of statusHandlers) h(s);
      },
    };
  }

  it("returns the original channel when studio is disconnected", () => {
    delete studioHooks.onStreamOpen;
    const { channel } = createMockChannel();
    expect(instrumentWSChannel(channel, { ...META, transport: "ws" })).toBe(channel);
  });

  it("fires onStreamOpen with mode 'direct' and transport 'ws'", () => {
    const onStreamOpen = vi.fn();
    studioHooks.onStreamOpen = onStreamOpen;

    const { channel } = createMockChannel();
    instrumentWSChannel(channel, { ...META, transport: "ws" });

    expect(onStreamOpen).toHaveBeenCalledTimes(1);
    expect(onStreamOpen.mock.calls[0]?.[0]).toMatchObject({
      transport: "ws",
      mode: "direct",
    });
  });

  it("fires onStreamMessage for each incoming data event", () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    studioHooks.onStreamMessage = onStreamMessage;

    const { channel, emitData } = createMockChannel();
    instrumentWSChannel(channel, { ...META, transport: "ws" });

    emitData({ text: "hello" });
    emitData({ text: "world" });

    expect(onStreamMessage).toHaveBeenCalledTimes(2);
    expect(onStreamMessage.mock.calls[0]?.[0].seq).toBe(1);
    expect(onStreamMessage.mock.calls[1]?.[0].seq).toBe(2);
  });

  it("fires onStreamClose with reason 'complete' when status becomes disconnected", () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamClose = vi.fn();
    studioHooks.onStreamClose = onStreamClose;

    const { channel, emitStatus } = createMockChannel();
    instrumentWSChannel(channel, { ...META, transport: "ws" });

    emitStatus("connected");
    emitStatus("disconnected");

    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(onStreamClose.mock.calls[0]?.[0].reason).toBe("complete");
  });

  it("fires onStreamClose with reason 'disconnect' when close() is called explicitly", () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamClose = vi.fn();
    studioHooks.onStreamClose = onStreamClose;

    const { channel } = createMockChannel();
    const wrapped = instrumentWSChannel(channel, { ...META, transport: "ws" });

    wrapped.close();

    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(onStreamClose.mock.calls[0]?.[0].reason).toBe("disconnect");
    expect(channel.close).toHaveBeenCalled();
  });

  it("send() forwards to underlying channel and emits outbound stream:message", () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    studioHooks.onStreamMessage = onStreamMessage;
    const { channel } = createMockChannel();
    const wrapped = instrumentWSChannel(channel, { ...META, transport: "ws" });

    wrapped.send({ text: "outgoing" });

    expect(channel.send).toHaveBeenCalledWith({ text: "outgoing" });
    // Outbound frames are tagged "message" so the Stream tab can render
    // an upward arrow distinct from inbound "data" frames.
    expect(onStreamMessage).toHaveBeenCalledTimes(1);
    expect(onStreamMessage.mock.calls[0]?.[0]).toMatchObject({
      eventType: "message",
      seq: 1,
      dataPreview: expect.stringContaining("outgoing"),
    });
  });

  it("inbound data frames are emitted with eventType 'data'", () => {
    studioHooks.onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    studioHooks.onStreamMessage = onStreamMessage;

    const { channel, emitData } = createMockChannel();
    instrumentWSChannel(channel, { ...META, transport: "ws" });

    emitData({ text: "incoming" });

    expect(onStreamMessage).toHaveBeenCalledTimes(1);
    expect(onStreamMessage.mock.calls[0]?.[0]).toMatchObject({
      eventType: "data",
      seq: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// instrumentWSPush — uses SSESubscription shape
// ---------------------------------------------------------------------------

describe("instrumentWSPush", () => {
  it("delegates to instrumentSSE (same shape)", async () => {
    const onStreamOpen = vi.fn();
    studioHooks.onStreamOpen = onStreamOpen;

    const sub = createMockSSESubscription(async function* () {
      yield { data: { tick: 1 } };
    });
    instrumentWSPush(sub, { ...META, transport: "ws" });

    expect(onStreamOpen).toHaveBeenCalledTimes(1);
    expect(onStreamOpen.mock.calls[0]?.[0]).toMatchObject({
      transport: "ws",
      mode: "direct",
    });
  });
});
