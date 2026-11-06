/**
 * @vitest-environment jsdom
 *
 * A stream reads no line, and no event, longer than 1 MiB of text. A
 * server that never ends one — a `data:` line with no line end, a block
 * with no blank line after it — would otherwise hold the client's memory
 * for as long as it sends, and each piece it sent was searched again for a
 * line end. Past the limit the stream ends with a ConnectionError of 1009,
 * as a socket's message too large is told: reconnecting would read the
 * same event again. The streams here are the test's own; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionError } from "../src/realtime/errors";
import { parseSSEFrames } from "../src/realtime/sse/parse-sse";
import { subscribeSSE } from "../src/realtime/sse/sse-client";
import { readSSELines } from "../src/realtime/sse/sse-lines";
import type { CloseInfo, Subscription } from "../src/realtime/subscription-types";

const LIMIT = 1_048_576;
const PIECE = 65_536;
const encoder = new TextEncoder();

let subscription: Subscription<unknown> | undefined;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  subscription?.close();
  subscription = undefined;
  vi.restoreAllMocks();
});

/* A body of `head`, then pieces of `fill` up to `total` characters, then `tail`; it counts what was read of it. */
function body(head: string, fill: string, total: number, tail = "") {
  const read = { pieces: 0 };
  const piece = encoder.encode(fill.repeat(Math.ceil(PIECE / fill.length)).slice(0, PIECE));
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(head));
    },
    pull(controller) {
      if (sent >= total) {
        controller.enqueue(encoder.encode(tail));
        controller.close();
        return;
      }
      sent += piece.byteLength;
      read.pieces++;
      controller.enqueue(piece);
    },
  });
  return { stream, read };
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("a stream's lines", () => {
  it("end the read at a line past 1 MiB, with no more of it read than that", async () => {
    const { stream, read } = body("data: ", "x", 8 * LIMIT, "\n\n");

    const error = await failureOf(async () => {
      for await (const _line of readSSELines(stream)) {
        /* Each line is let go of. */
      }
    });

    expect(error).toBeInstanceOf(ConnectionError);
    expect(error).toMatchObject({ code: 1009 });
    expect(read.pieces * PIECE).toBeLessThanOrEqual(LIMIT + 2 * PIECE);
  });

  it("are read whole up to 1 MiB", async () => {
    const { stream } = body("data: ", "x", LIMIT - PIECE, "\n\n");
    let longest = 0;

    for await (const line of readSSELines(stream)) longest = Math.max(longest, line.length);

    expect(longest).toBeGreaterThan(LIMIT - 2 * PIECE);
  });
});

describe("a stream's events", () => {
  it("end the read at a block past 1 MiB, however short its lines", async () => {
    const { stream, read } = body("", "data: x\n", 8 * LIMIT, "\n");

    const error = await failureOf(async () => {
      for await (const _frame of parseSSEFrames(stream)) {
        /* No block ends. */
      }
    });

    expect(error).toMatchObject({ code: 1009 });
    expect(read.pieces * PIECE).toBeLessThanOrEqual(LIMIT + 2 * PIECE);
  });
});

describe("a subscription whose server never ends a line", () => {
  it("ends with the ConnectionError of 1009 rather than reconnecting to it", async () => {
    let requests = 0;
    const closed: CloseInfo[] = [];
    subscription = subscribeSSE("https://api.example.com/sse/feed", {
      fetch: async () => {
        requests++;
        const { stream } = body("data: ", "x", 8 * LIMIT, "\n\n");
        return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
      },
    });
    subscription.on("close", (info) => closed.push(info));

    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 5_000 });

    expect(closed[0]).toMatchObject({ reason: "failed", error: { code: 1009 } });
    expect(requests).toBe(1);
  });
});
