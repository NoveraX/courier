/**
 * A proxied answer Node refuses to write, before its head is sent, is
 * Fastify's to answer: its error handler answers 500, where a reply handed
 * over too early left the request waiting with no answer at all.
 */
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

/* A header value Web headers take and Node's own writeHead refuses. */
const REFUSED_VALUE = `a${String.fromCharCode(0x7f)}b`;

vi.mock("@noverax/courier", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createHandler: () => ({
    handle: async () => new Response("{}", { headers: { "x-refused": REFUSED_VALUE } }),
    shutdownSSE: async () => {},
  }),
}));

const { courierPlugin } = await import("../src/index");

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("an answer Node refuses to write before its head", () => {
  it("is answered 500 by Fastify, not left waiting", async () => {
    app = Fastify();
    await app.register(courierPlugin, { prefix: "/api/request" });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/request?_s=api&_m=list`, {
      signal: AbortSignal.timeout(2_000),
    });
    await response.body?.cancel();

    expect(response.status).toBe(500);
  });
});
