import { defineApi, defineGroup, courier } from "@noverax/courier/define";
import type { WSChannel } from "@noverax/courier/realtime";
import { describe, expect, it, vi } from "vitest";
import { createMockClient } from "../src/create-mock-client";

const { query } = courier();

type ChatMessage = Record<string, unknown>;

const noop = () => {};

const chat = defineGroup({
  prefix: "chat",
  endpoints: {
    room: query.variables<{ roomId?: string }>().response<ChatMessage>().via((http, vars) => http.get("room", vars)),
  },
});

const api = defineApi({
  baseURL: "https://api.example.com",
  groups: { chat },
});

describe("mock client — WS .channel()", () => {
  it("returns WSChannel from .channel() mock", () => {
    const { client, mock } = createMockClient<typeof api>();

    mock("chat", "room").channel(() => ({ onMessage: noop }));

    const ch = client.chat.room() as unknown as WSChannel<unknown, unknown>;
    expect(ch).toBeDefined();
    expect(ch.send).toBeInstanceOf(Function);
    expect(ch.on).toBeInstanceOf(Function);
    expect(ch.close).toBeInstanceOf(Function);
  });

  it("receives messages from onJoin", async () => {
    const { client, mock } = createMockClient<typeof api>();

    mock("chat", "room").channel(() => ({
      onJoin(ctx) {
        ctx.send({ joined: true });
      },
      onMessage: noop,
    }));

    const ch = client.chat.room() as unknown as WSChannel<unknown, { joined: boolean }>;
    const messages: unknown[] = [];
    ch.on("data", (msg) => messages.push(msg));

    await new Promise((r) => setTimeout(r, 10));

    expect(messages).toEqual([{ joined: true }]);
    ch.close();
  });

  it("handles bidirectional messaging", async () => {
    const { client, mock } = createMockClient<typeof api>();

    mock("chat", "room").channel(() => ({
      onMessage(ctx, msg) {
        ctx.send({ echo: msg });
      },
    }));

    const ch = client.chat.room() as unknown as WSChannel<string, { echo: string }>;
    const responses: unknown[] = [];
    ch.on("data", (msg) => responses.push(msg));

    await new Promise((r) => setTimeout(r, 10));

    ch.send("hello");
    await new Promise((r) => setTimeout(r, 10));

    expect(responses).toEqual([{ echo: "hello" }]);
    ch.close();
  });

  it("passes variables to channel context", async () => {
    const { client, mock } = createMockClient<typeof api>();
    let receivedVars: unknown;

    mock("chat", "room").channel((ctx) => {
      receivedVars = ctx.variables;
      return { onMessage: noop };
    });

    const ch = client.chat.room({ roomId: "42" }) as unknown as WSChannel<unknown, unknown>;
    await new Promise((r) => setTimeout(r, 10));

    expect(receivedVars).toEqual({ roomId: "42" });
    ch.close();
  });

  it("records channel in history", () => {
    const { client, mock, history } = createMockClient<typeof api>();

    mock("chat", "room").channel(() => ({ onMessage: noop }));
    client.chat.room();

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      group: "chat",
      method: "room",
      mocked: true,
      channel: true,
    });
  });

  it("calls onLeave on close", async () => {
    const { client, mock } = createMockClient<typeof api>();
    const onLeave = vi.fn();

    mock("chat", "room").channel(() => ({ onMessage: noop, onLeave }));

    const ch = client.chat.room() as unknown as WSChannel<unknown, unknown>;
    await new Promise((r) => setTimeout(r, 10));

    ch.close();
    await new Promise((r) => setTimeout(r, 10));

    expect(onLeave).toHaveBeenCalledOnce();
  });
});
