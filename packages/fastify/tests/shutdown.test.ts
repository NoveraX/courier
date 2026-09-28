/**
 * Closing a Fastify host while Courier streams are open.
 *
 * `app.close()` waits for every open connection, and an SSE stream does not
 * end on its own: the close hung for as long as the stream's lifetime cap,
 * 30 minutes by default, and nothing could drain it because the handlers
 * kept their stream registry to themselves.
 */
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courierPlugin, courierSSEHandler } from "../src";

const { stream } = courier();
let app: FastifyInstance | undefined;

const forever = stream.response<number>().implement(async function* (ctx) {
  for (let n = 0; !ctx.signal.aborted; n += 1) {
    yield { data: n };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
});

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: { forever } }) });
});

afterEach(async () => {
  app?.server.closeAllConnections();
  await app?.close();
  app = undefined;
});

async function listen(instance: FastifyInstance): Promise<string> {
  app = instance;
  return instance.listen({ port: 0, host: "127.0.0.1" });
}

/** Open a stream, read its first event, and collect the rest until it ends. */
async function openStream(url: string): Promise<{ rest: Promise<string> }> {
  const response = await fetch(url, { headers: { accept: "text/event-stream" } });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("the stream has no body");
  const decoder = new TextDecoder();
  await reader.read();
  const rest = (async () => {
    let text = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      text += decoder.decode(chunk.value);
    }
    return text;
  })();
  return { rest };
}

const timeout = (ms: number) => new Promise((resolve) => setTimeout(() => resolve("still open"), ms));

describe("closing a Fastify host with a stream open", () => {
  it("drains the proxy plugin's streams on app.close()", async () => {
    const instance = Fastify();
    instance.register(courierPlugin);
    const origin = await listen(instance);
    const { rest } = await openStream(`${origin}/api/request?_s=api&_m=forever`);

    const closed = await Promise.race([instance.close().then(() => "closed"), timeout(4000)]);

    expect(closed).toBe("closed");
    expect(await rest).toContain("event: shutdown");
  });

  it("drains an SSE route's streams from a preClose hook", async () => {
    const sse = courierSSEHandler();
    const instance = Fastify();
    instance.get("/api/sse", sse);
    instance.addHook("preClose", () => sse.shutdownSSE({ drainMs: 500 }));
    const origin = await listen(instance);
    const { rest } = await openStream(`${origin}/api/sse?_s=api&_m=forever`);
    expect(sse.sseConnections.count).toBe(1);

    const closed = await Promise.race([instance.close().then(() => "closed"), timeout(4000)]);

    expect(closed).toBe("closed");
    expect(await rest).toContain("event: shutdown");
    expect(sse.sseConnections.count).toBe(0);
  });
});
