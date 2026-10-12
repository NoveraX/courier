/**
 * Reading a specification's body once the host has answered. However the
 * body fails — the connection closes or resets partway, the compressed data
 * is truncated or corrupt, or it grows past the limit — the fetch fails as
 * the host's failure, naming the URL, and a body cut off fails at once
 * whatever its encoding.
 */
import { IncomingMessage } from "node:http";
import { createServer, type Server, Socket } from "node:net";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { DEMO_MAX_BODY } from "../src/server/demo/demo-rest-guard";
import { fetchSpec } from "../src/server/fetch-spec";
import { PUBLIC_SPEC_MAX_BYTES, readSpecBody } from "../src/server/read-spec-body";
import { SpecFetchError } from "../src/server/spec-fetch-error";
import type { SpecHostAllowlist } from "../src/server/spec-host-allowlist";
import { requestSpec } from "../src/server/spec-request";

const NOTHING_LISTED: SpecHostAllowlist = async () => ({ state: "listed", hosts: [] });
const ON_THIS_MACHINE = { loopback: true, admitPrivate: async () => undefined };
const SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  paths: Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => [
      `/pets/${i}`,
      { get: { operationId: `getPet${i}`, responses: { "200": { description: `pet ${i}` } } } },
    ]),
  ),
});
const ENCODED = new Map<string, Buffer>([
  ["identity", Buffer.from(SPEC)],
  ["gzip", gzipSync(SPEC)],
  ["deflate", deflateSync(SPEC)],
  ["br", brotliCompressSync(SPEC)],
]);

function encoded(encoding: string): Buffer {
  const body = ENCODED.get(encoding);
  if (body === undefined) throw new Error(`no body encoded as ${encoding}`);
  return body;
}

function firstHalf(body: Buffer): Buffer {
  return body.subarray(0, body.length >> 1);
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/* A server that writes each answer by hand, once the request has arrived. */
async function serveRaw(answer: (socket: Socket) => void): Promise<string> {
  const server = createServer((socket) => {
    socket.once("data", () => answer(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("the spec server has no port");
  return `http://127.0.0.1:${address.port}/spec.json`;
}

function head(encoding: string, length: number): string {
  return `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-encoding: ${encoding}\r\ncontent-length: ${length}\r\n\r\n`;
}

/* The status line, the headers and the first half of the body, then the connection ends. */
function halfThen(encoding: string, close: (socket: Socket) => void): (socket: Socket) => void {
  const body = encoded(encoding);
  return (socket) => {
    socket.write(head(encoding, body.length));
    socket.write(firstHalf(body), () => close(socket));
  };
}

/* Whether the server's side of a connection closes within the budget. */
function closesWithin(socket: Socket | undefined, budgetMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (socket === undefined || socket.closed) {
      resolve(socket !== undefined);
      return;
    }
    const timer = setTimeout(() => resolve(false), budgetMs);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function failure(run: () => Promise<unknown>): Promise<{ error: unknown; ms: number }> {
  const started = Date.now();
  try {
    await run();
  } catch (error) {
    return { error, ms: Date.now() - started };
  }
  throw new Error("the fetch did not fail");
}

describe("readSpecBody", () => {
  it.each(["identity", "gzip", "deflate", "br"])(
    "fails at once when the connection closes partway through a %s body",
    async (encoding) => {
      const url = await serveRaw(halfThen(encoding, (socket) => socket.end()));

      const { error, ms } = await failure(() => requestSpec(new URL(url), ON_THIS_MACHINE, 3_000));

      expect(error).toBeInstanceOf(SpecFetchError);
      expect(error).toMatchObject({
        code: "SPEC_UNREACHABLE",
        refused: false,
        message: `${url} closed the connection before the whole specification arrived (ECONNRESET).`,
      });
      expect(ms).toBeLessThan(1_000);
    },
  );

  it.each(["identity", "gzip"])(
    "reports a connection reset partway through a %s body as a body cut off",
    async (encoding) => {
      /* Reset once the client has read what came: Windows drops the data a reset finds unread. */
      const url = await serveRaw(
        halfThen(encoding, (socket) => setTimeout(() => socket.resetAndDestroy(), 200)),
      );

      const { error } = await failure(() => fetchSpec(url, NOTHING_LISTED));

      expect(error).toMatchObject({
        code: "SPEC_UNREACHABLE",
        refused: false,
        message: `${url} closed the connection before the whole specification arrived (ECONNRESET).`,
      });
    },
  );

  it.each(["gzip", "deflate", "br"])(
    "reports a %s body whose connection Windows aborted partway as a body cut off",
    async (encoding) => {
      const url = new URL("http://127.0.0.1:1/spec.json");
      const response = new IncomingMessage(new Socket());
      response.headers = { "content-encoding": encoding };
      const reading = readSpecBody(response, url);
      response.push(firstHalf(encoded(encoding)));
      response.destroy(Object.assign(new Error("read ECONNABORTED"), { code: "ECONNABORTED" }));

      await expect(reading).rejects.toMatchObject({
        code: "SPEC_UNREACHABLE",
        message: `${url.href} closed the connection before the whole specification arrived (ECONNABORTED).`,
      });
    },
  );

  it.each([
    {
      label: "a truncated gzip body",
      encoding: "gzip",
      sent: firstHalf(encoded("gzip")),
      reason: "unexpected end of file",
    },
    {
      label: "a truncated deflate body",
      encoding: "deflate",
      sent: firstHalf(encoded("deflate")),
      reason: "unexpected end of file",
    },
    {
      label: "a plain body labelled gzip",
      encoding: "gzip",
      sent: encoded("identity"),
      reason: "incorrect header check",
    },
    {
      label: "a plain body labelled br",
      encoding: "br",
      sent: encoded("identity"),
      reason: "Decompression failed",
    },
  ])(
    "reports $label, sent whole, as a body that does not decompress",
    async ({ encoding, sent, reason }) => {
      const url = await serveRaw((socket) =>
        socket.end(Buffer.concat([Buffer.from(head(encoding, sent.length)), sent])),
      );

      const { error } = await failure(() => fetchSpec(url, NOTHING_LISTED));

      expect(error).toMatchObject({
        code: "SPEC_UNREACHABLE",
        refused: false,
        message: `${url} sent a ${encoding} body that does not decompress (${reason}).`,
      });
    },
  );

  it("closes the connection as soon as a body does not decompress, without waiting for the rest", async () => {
    const connections: Socket[] = [];
    const url = await serveRaw((socket) => {
      connections.push(socket);
      socket.write(head("gzip", 1_000_000));
      socket.write("this is not gzip, and a megabyte more is on its way");
    });

    const { error } = await failure(() => fetchSpec(url, NOTHING_LISTED));
    const closed = await closesWithin(connections[0], 1_000);

    expect(error).toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: `${url} sent a gzip body that does not decompress (incorrect header check).`,
    });
    expect(closed).toBe(true);
  });

  it("stops reading a body past the limit it is given", async () => {
    const body = Buffer.alloc(PUBLIC_SPEC_MAX_BYTES + 1);
    const url = await serveRaw((socket) =>
      socket.end(Buffer.concat([Buffer.from(head("identity", body.length)), body])),
    );

    const { error } = await failure(() =>
      requestSpec(new URL(url), ON_THIS_MACHINE, 30_000, { maxBytes: PUBLIC_SPEC_MAX_BYTES }),
    );

    expect(error).toMatchObject({
      code: "SPEC_TOO_LARGE",
      message: `${url} is larger than 16 MB.`,
    });
  });

  /* A demo's visitor has Studio read from a URL no more than the demo takes pasted in. */
  it("gives a public demo's visitor the demo's own limit", () => {
    expect(PUBLIC_SPEC_MAX_BYTES).toBe(DEMO_MAX_BODY);
  });

  it("stops reading a compressed body that unfolds past 64 MB", async () => {
    const bomb = gzipSync(Buffer.alloc(65 * 1024 * 1024));
    const url = await serveRaw((socket) =>
      socket.end(Buffer.concat([Buffer.from(head("gzip", bomb.length)), bomb])),
    );

    const { error } = await failure(() => fetchSpec(url, NOTHING_LISTED));

    expect(error).toMatchObject({
      code: "SPEC_TOO_LARGE",
      message: `${url} is larger than 64 MB.`,
    });
  });
});
