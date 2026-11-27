/**
 * Calls that share an answer read its body apart: one that stops waiting
 * while the body arrives has its read cut short, and rejects with its
 * cancellation as a cancelled request does, its reason as the cause; the
 * other reads it whole.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AbortError } from "../src/errors";
import { coreFetch } from "../src/utils/fetch";

let server: Server;
let url: string;
let requests = 0;

beforeEach(async () => {
  requests = 0;
  server = createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("first half, ");
    setTimeout(() => res.end("second half"), 150);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/story`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("calls that share an answer", () => {
  it("read its body apart, one cut short when it stops waiting", async () => {
    const leaving = new AbortController();
    const reason = new Error("left the page");
    const [staying, left] = await Promise.all([
      coreFetch("get", url),
      coreFetch("get", url, { signal: leaving.signal }),
    ]);

    const cut = left.read("text");
    leaving.abort(reason);

    await expect(cut).rejects.toBeInstanceOf(AbortError);
    await expect(cut).rejects.toMatchObject({ cause: reason });
    await expect(staying.read("text")).resolves.toBe("first half, second half");
    expect(requests).toBe(1);
  });

  it("each read the whole of it, and the same status and headers", async () => {
    const answers = await Promise.all([
      coreFetch("get", url),
      coreFetch("get", url),
      coreFetch("get", url),
    ]);

    const bodies = await Promise.all(answers.map((answer) => answer.read("text")));

    expect(bodies).toEqual(Array(3).fill("first half, second half"));
    expect(
      answers.map(({ response }) => [response.status, response.headers.get("content-type")]),
    ).toEqual(Array(3).fill([200, "text/plain"]));
    expect(requests).toBe(1);
  });
});
