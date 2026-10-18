/**
 * A streamed answer that outlasts Fastify's handler timeout, through the
 * plugin. The reply is handed over before the answer is written, so the
 * timeout no longer answers 503 over a stream already under way, which threw
 * from its timer and took the process down; the stream is read whole.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { courierPlugin } from "../src/index";

const { endpoint } = courier();
const servers: Server[] = [];
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** An upstream that sends six ticks, 100 ms apart. */
async function slowUpstream(): Promise<string> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    let sent = 0;
    const timer = setInterval(() => {
      sent += 1;
      res.write(`tick${sent}\n`);
      if (sent === 6) {
        clearInterval(timer);
        res.end();
      }
    }, 100);
    res.once("close", () => clearInterval(timer));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("a streamed answer longer than Fastify's handler timeout", () => {
  it("is streamed whole", async () => {
    registerSources({
      api: defineApi({
        expose: true,
        baseURL: await slowUpstream(),
        endpoints: { ticks: endpoint.get("ticks") },
      }),
    });
    app = Fastify({ handlerTimeout: 250 });
    await app.register(courierPlugin, { prefix: "/api/request" });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;

    /* A read, as a GET: a POST's request ends once its body is read, which
       clears the timeout before it fires and hid the crash. */
    const options = encodeURIComponent(JSON.stringify({ stream: true }));
    const response = await fetch(
      `http://127.0.0.1:${port}/api/request?_s=api&_m=ticks&_o=${options}`,
      { signal: AbortSignal.timeout(5_000) },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("tick1\ntick2\ntick3\ntick4\ntick5\ntick6\n");
  });
});
