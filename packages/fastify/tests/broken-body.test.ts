/**
 * A streamed answer whose upstream drops it part-way, through the plugin.
 *
 * Its head is sent before the body breaks, so the answer cannot turn into an
 * error answer: the connection is cut, and the client learns the body broke
 * rather than taking the part sent for the whole. Fastify does not try to
 * answer over it, and goes on serving the next call.
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

/** An upstream that sends the start of `drop`'s answer, then drops the connection; `whole` answers in full. */
async function upstream(): Promise<string> {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    if (req.url === "/whole") {
      res.end("all of it\n");
      return;
    }
    res.write("tick\n");
    setTimeout(() => res.destroy(), 20);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function proxyOn(baseURL: string): Promise<string> {
  registerSources({
    api: defineApi({
      expose: true,
      baseURL,
      endpoints: { drop: endpoint.post("drop"), whole: endpoint.post("whole") },
    }),
  });
  app = Fastify();
  await app.register(courierPlugin, { prefix: "/api/request" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/request`;
}

/* What the client made of a streamed call: the whole answer, or the name of what broke it. */
async function streamed(proxy: string, method: string): Promise<string> {
  try {
    const response = await fetch(`${proxy}?_s=api&_m=${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: { stream: true } }),
    });
    return `whole: ${await response.text()}`;
  } catch (error) {
    return error instanceof Error ? error.name : "unknown";
  }
}

describe("a streamed answer its upstream drops part-way", () => {
  it("is cut off, and the next call is served", async () => {
    const proxy = await proxyOn(await upstream());

    expect(await streamed(proxy, "drop")).toBe("TypeError");
    expect(await streamed(proxy, "whole")).toBe("whole: all of it\n");
  });
});
