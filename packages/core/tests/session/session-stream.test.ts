/**
 * A stream of an API that keeps a session, relayed through the proxy: the
 * upstream is opened with the session's cookies alone, as an HTTP call is.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createHandler } from "../../src/adapter";
import { courier, defineApi } from "../../src/define";
import { sendWebResponse, toWebRequest } from "../../src/node";

const { stream } = courier();
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("a relayed stream of an API that keeps a session", () => {
  it("is opened with the session's cookies and nothing else of the browser's", async () => {
    const seen: IncomingHttpHeaders[] = [];
    const upstream = await listen(
      createServer((req, res) => {
        seen.push(req.headers);
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("data: hello\n\n");
      }),
    );
    const api = defineApi({
      name: "feed",
      baseURL: upstream,
      session: { cookies: ["sid"] },
      endpoints: { live: stream.response<unknown>().get("live") },
    });
    const handler = createHandler({ sources: { feed: api } });
    const proxy = await listen(
      createServer(async (req, res) => {
        await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
      }),
    );
    const controller = new AbortController();

    const response = await fetch(`${proxy}/api/sse?_s=feed&_m=live`, {
      headers: { accept: "text/event-stream", cookie: "sid=a1; theme=dark; _ga=GA1" },
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();

    expect(response.status).toBe(200);
    expect(seen[0]?.cookie).toBe("sid=a1");
  });
});
