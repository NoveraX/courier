import { describe, expect, it } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";

const Incoming = z.object({ text: z.string() });

/**
 * An implementation written inline must be typed by the slot it fills.
 *
 * Offering the two channel shapes as a union — or as overloads — leaves an
 * inline handler with no contextual type, and every parameter silently widens
 * to `any`. These assign each inferred parameter to a declared type, so the
 * widening reappears as a compile error rather than as lost safety.
 */
describe("handler inference", () => {
  const { stream, channel } = courier();

  it("types the generator serving a stream", () => {
    const feed = stream
      .variables<{ userId: string }>()
      .response<{ n: number }>()
      .implement(async function* (ctx) {
        const userId: string = ctx.variables.userId;
        yield { data: { n: userId.length } };
      });

    expect(feed.kind).toBe("stream");
  });

  it("types the generator serving a channel nothing can send on", () => {
    const ticker = channel
      .variables<{ symbol: string }>()
      .response<{ price: number }>()
      .implement(async function* (ctx) {
        const symbol: string = ctx.variables.symbol;
        yield { price: symbol.length };
      });

    expect(ticker.kind).toBe("channel");
  });

  it("types both directions of a channel that accepts messages", () => {
    const room = channel
      .variables<{ roomId: string }>()
      .send(Incoming)
      .response<{ text: string }>()
      .implement((variables) => {
        const roomId: string = variables.roomId;
        return {
          onJoin(ctx) {
            ctx.send({ text: `joined ${roomId}` });
          },
          onMessage(ctx, message) {
            const text: string = message.text;
            ctx.send({ text });
          },
        };
      });

    expect(room.kind).toBe("channel");
  });

  it("rejects the wrong shape for what the channel declared", () => {
    function rejected(): void {
      const pushOnly = channel.response<{ price: number }>();
      const handlers = () => ({ onMessage() {} });
      // @ts-expect-error — a channel nothing can send on takes a generator
      pushOnly.implement(handlers);

      const duplex = channel.send(Incoming).response<{ text: string }>();
      async function* generator() {
        yield { text: "" };
      }
      // @ts-expect-error — a channel that accepts messages takes handlers
      duplex.implement(generator);
    }

    expect(rejected).toBeTypeOf("function");
  });
});

describe("per-call options in a wire closure", () => {
  const { endpoint, stream } = courier();

  it("accepts the options the client carries out at request time", () => {
    const download = endpoint
      .variables<{ id: string }>()
      .via((http) => http.get(":id/download", vars(), { timeout: 30_000 }))
      .reads();

    expect(download.method).toBe("get");
    expect(download.path).toBe(":id/download");
  });

  it("accepts options on a stream closure too", () => {
    const feed = stream.via((sse) => sse.get("feed", undefined, { timeout: 0 }));

    expect(feed.path).toBe("feed");
  });

  it("gives head its options in the second position, having no body", () => {
    const ping = endpoint.via((http) => http.head("ping", { timeout: 100 })).reads();

    expect(ping.method).toBe("head");
  });
});

function vars(): Record<string, unknown> {
  return {};
}
