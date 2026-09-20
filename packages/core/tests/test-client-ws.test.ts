import { describe, expect, it, vi } from "vitest";
import { defineApi, defineGroup, courier } from "../src/define";
import type { WSChannel } from "../src/realtime/types";
import { createTestClient } from "../src/testing/create-test-client";

const { endpoint } = courier();

type ChatMessage = Record<string, unknown>;

const noop = () => {};

const chat = defineGroup({
  prefix: "chat",
  endpoints: {
    room: endpoint.variables<{ roomId?: string }>().response<ChatMessage>().get("room"),
  },
});

const api = defineApi({
  baseURL: "https://api.example.com",
  groups: { chat },
});

describe("createTestClient — WS channel", () => {
  it("returns WSChannel from .channel() mock", () => {
    const { client, mock } = createTestClient<typeof api>();

    mock("chat", "room").channel({ onMessage: noop });

    const ch = client.chat.room() as unknown as WSChannel<unknown, unknown>;
    expect(ch).toBeDefined();
    expect(ch.send).toBeInstanceOf(Function);
    expect(ch.on).toBeInstanceOf(Function);
    expect(ch.close).toBeInstanceOf(Function);
  });

  it("receives messages from onJoin via ctx.send", async () => {
    const { client, mock } = createTestClient<typeof api>();

    mock("chat", "room").channel({
      onJoin(ctx) {
        ctx.send({ type: "welcome", text: "hello" });
      },
      onMessage: noop,
    });

    const ch = client.chat.room() as unknown as WSChannel<unknown, { type: string; text: string }>;
    const messages: unknown[] = [];

    ch.on("data", (msg) => messages.push(msg));

    await new Promise((r) => setTimeout(r, 10));

    expect(messages).toEqual([{ type: "welcome", text: "hello" }]);
    ch.close();
  });

  it("sends messages to onMessage handler", async () => {
    const { client, mock } = createTestClient<typeof api>();
    const received: unknown[] = [];

    mock("chat", "room").channel({
      onMessage(ctx, msg) {
        received.push(msg);
        ctx.send({ echo: msg });
      },
    });

    const ch = client.chat.room() as unknown as WSChannel<string, { echo: string }>;
    const responses: unknown[] = [];
    ch.on("data", (msg) => responses.push(msg));

    await new Promise((r) => setTimeout(r, 10));

    ch.send("hello");
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toEqual(["hello"]);
    expect(responses).toEqual([{ echo: "hello" }]);
    ch.close();
  });

  it("records channel request in history", () => {
    const { client, mock, history } = createTestClient<typeof api>();

    mock("chat", "room").channel({ onMessage: noop });
    client.chat.room({ roomId: "42" });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      group: "chat",
      method: "room",
      variables: { roomId: "42" },
      channel: true,
    });
  });

  it("calls onLeave when channel is closed", async () => {
    const { client, mock } = createTestClient<typeof api>();
    const onLeave = vi.fn();

    mock("chat", "room").channel({ onMessage: noop, onLeave });

    const ch = client.chat.room() as unknown as WSChannel<unknown, unknown>;
    await new Promise((r) => setTimeout(r, 10));

    ch.close();
    await new Promise((r) => setTimeout(r, 10));

    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("tracks connection status", async () => {
    const { client, mock } = createTestClient<typeof api>();
    const statuses: string[] = [];

    mock("chat", "room").channel({ onMessage: noop });

    const ch = client.chat.room() as unknown as WSChannel<unknown, unknown>;
    ch.on("status", (s) => statuses.push(s));

    await new Promise((r) => setTimeout(r, 20));

    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");

    ch.close();
    expect(ch.status).toBe("disconnected");
  });

  it("supports delay before connection", async () => {
    const { client, mock } = createTestClient<typeof api>();
    const onJoin = vi.fn();

    mock("chat", "room").channel({ onJoin, onMessage: noop }).delay(50);

    const ch = client.chat.room() as unknown as WSChannel<unknown, unknown>;

    await new Promise((r) => setTimeout(r, 10));
    expect(onJoin).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 60));
    expect(onJoin).toHaveBeenCalledOnce();

    ch.close();
  });
});
