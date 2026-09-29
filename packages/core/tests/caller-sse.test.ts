import { describe, expect, it, vi } from "vitest";
import { createCaller } from "../src/caller";
import { defineApi, defineGroup } from "../src/define";
import { courier } from "../src/define/courier";
import { subscribeSSE } from "../src/realtime/sse/sse-client";

const { endpoint, stream } = courier();

vi.mock("../src/realtime/sse/sse-client", () => ({
  subscribeSSE: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
    }),
    close: vi.fn(),
    status: "connecting" as const,
    on: vi.fn(),
  })),
}));

const mockedSubscribeSSE = vi.mocked(subscribeSSE);

describe("SSE transport detection — createCaller", () => {
  it("detects SSE endpoint and calls subscribeSSE once the stream client has loaded", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      groups: {
        notifications: defineGroup({
          prefix: "notifications",
          endpoints: {
            feed: stream.variables<{ userId: string }>().response<{ msg: string }>().get("feed"),
          },
        }),
      },
    });

    const client = createCaller(api);
    const result = (client as unknown as Record<string, Record<string, (v: unknown) => unknown>>)
      .notifications!.feed!({ userId: "42" });

    expect(result).toHaveProperty("close");
    expect(result).toHaveProperty("status", "connecting");
    await vi.waitFor(() =>
      expect(mockedSubscribeSSE).toHaveBeenCalledWith(
        "https://api.example.com/notifications/feed?userId=42",
        expect.objectContaining({ headers: expect.any(Object) }),
      ),
    );
  });

  it("falls through to HTTP for non-SSE endpoints", () => {
    mockedSubscribeSSE.mockClear();

    const api = defineApi({
      baseURL: "https://api.example.com",
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            getAll: endpoint.get("").response<string[]>(),
          },
        }),
      },
    });

    const client = createCaller(api);
    const result = (client as unknown as Record<string, Record<string, () => unknown>>).users!
      .getAll!();

    // HTTP returns a Promise, SSE was not called
    expect(result).toBeInstanceOf(Promise);
    expect(mockedSubscribeSSE).not.toHaveBeenCalled();

    // Suppress unhandled rejection (no real server)
    (result as Promise<unknown>).catch(() => {});
  });
});
