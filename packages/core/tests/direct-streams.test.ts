/**
 * A direct caller opens a stream another server serves as its source
 * declares it: with the source's `headers`, which reached every HTTP call
 * and no stream, so a stream of an API that takes its key there answered
 * 401; with data that is not JSON kept as its text, where it was skipped;
 * and never at a route above the one it declares.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define";
import { RealtimeValidationError } from "../src/realtime/errors";

const { stream } = courier();
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function thirdParty(): Promise<{
  origin: string;
  seen: { url: string; headers: IncomingHttpHeaders }[];
}> {
  const seen: { url: string; headers: IncomingHttpHeaders }[] = [];
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", headers: req.headers });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"n":1}\n\ndata: [DONE]\n\nevent: courier:complete\ndata: \n\n');
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, seen };
}

function api(origin: string) {
  return defineApi({
    baseURL: origin,
    headers: { Authorization: "Bearer k1", "X-Api-Key": "key" },
    groups: {
      chat: defineGroup({
        prefix: "chat",
        endpoints: {
          stream: stream.variables<{ id: string }>().response<unknown>().get(":id/stream"),
        },
      }),
    },
  });
}

describe("a direct caller's stream of another server", () => {
  it("is opened with the source's headers, and keeps data that is not JSON as its text", async () => {
    const upstream = await thirdParty();
    const caller = createCaller(api(upstream.origin));

    const data: unknown[] = [];
    for await (const event of await caller.chat.stream({ id: "c1" })) data.push(event.data);

    expect(data).toEqual([{ n: 1 }, "[DONE]"]);
    expect(upstream.seen[0]?.url).toBe("/chat/c1/stream");
    expect(upstream.seen[0]?.headers).toMatchObject({
      authorization: "Bearer k1",
      "x-api-key": "key",
    });
  });

  it("refuses a path parameter that would reach another route, and sends nothing", async () => {
    const upstream = await thirdParty();
    const caller = createCaller(api(upstream.origin));

    const failure = await (async () => {
      for await (const _event of await caller.chat.stream({ id: ".." })) void _event;
    })().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeValidationError);
    expect(String(failure)).toContain("would change the route");
    expect(upstream.seen).toEqual([]);
  });
});
