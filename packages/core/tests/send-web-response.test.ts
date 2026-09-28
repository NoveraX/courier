/**
 * A streamed proxy answer whose client stops reading and leaves.
 *
 * The proxy stops the upstream body when the client goes, and stopping it a
 * second time from the response side then failed with the abort that had
 * already ended it. Every client cancel of a streamed call was logged as a
 * warning with a full stack.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
    registerSources({ api: defineApi({ baseURL: upstream, endpoints: { ticks: endpoint.post("ticks") } }) });
    const { handle } = createHandler();
    const failures: unknown[] = [];
    let sent: Promise<void> | undefined;
    const proxy = await listen(
      createServer(async (req, res) => {
        sent = sendWebResponse(await handle(toWebRequest(req, res)), res).catch((failure: unknown) => {
          failures.push(failure);
        });
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
