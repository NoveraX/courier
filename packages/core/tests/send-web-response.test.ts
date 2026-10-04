/**
 * A streamed answer whose client stops reading, or leaves.
 *
 * The proxy stops the upstream body when the client goes, so stopping it a
 * second time from the response side meets the abort that already ended
 * it. That is no failure: a client cancelling a streamed call logs no
 * warning with a full stack.
 */
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const servers: Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  _resetSourcesForTests();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An upstream that never stops sending. */
function endless(): Server {
  return createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    const timer = setInterval(() => res.write("tick\n"), 5);
    res.once("close", () => clearInterval(timer));
  });
}

describe("a streamed answer the client cancels", () => {
  it("ends quietly on the server", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = await listen(endless());
    const { endpoint } = courier();
    registerSources({
      api: defineApi({ baseURL: upstream, endpoints: { ticks: endpoint.post("ticks") } }),
    });
    const { handle } = createHandler();
    const failures: unknown[] = [];
    let sent: Promise<void> | undefined;
    const proxy = await listen(
      createServer(async (req, res) => {
        sent = sendWebResponse(await handle(toWebRequest(req, res)), res).catch(
          (failure: unknown) => {
            failures.push(failure);
          },
        );
      }),
    );

    const response = await fetch(`${proxy}/api/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "api", method: "ticks", options: { stream: true } }),
    });
    const reader = response.body!.getReader();
    for (let chunk = 0; chunk < 3; chunk += 1) await reader.read();
    await reader.cancel();

    await vi.waitFor(() => expect(sent).toBeDefined());
    await sent;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(failures).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("a streamed answer the client does not read", () => {
  it("is read from its body no faster than the client reads it", async () => {
    /* Without waiting for the socket to drain, every chunk the body had was
       pulled and queued in memory for a client that took none of them. */
    const chunk = new Uint8Array(64 * 1024);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
          if (pulled === 10_000) controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const url = new URL(
      await listen(createServer((_req, res) => void sendWebResponse(new Response(body), res))),
    );
    const client = connect(Number(url.port), url.hostname);
    client.write(`GET / HTTP/1.1\r\nHost: ${url.host}\r\n\r\n`);
    client.pause();

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(pulled).toBeGreaterThan(0);
    expect(pulled).toBeLessThan(1_000);
    client.destroy();
  });
});
