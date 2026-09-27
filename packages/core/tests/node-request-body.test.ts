/**
 * The body of the Web request a Node adapter builds, and what happens to the
 * part of it nobody reads.
 *
 * A browser reads a response only once its upload is done or the connection
 * closes. A body the handler never read therefore has to be taken off the
 * connection by someone, or the browser waits on its own upload until the
 * server's keep-alive timer closes the socket — 6 s on Express, 73 s on
 * Fastify.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { sendWebResponse, toWebRequest } from "../src/node";
import { sendLikeABrowser } from "./helpers/send-like-a-browser";

const UPLOAD = { method: "POST", headers: { "content-type": "application/json" } } as const;
const SIXTEEN_MB = 16 * 1_048_576;

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function serve(
  handle: (request: Request, req: IncomingMessage, res: ServerResponse) => Promise<Response>,
): Promise<number> {
  server = createServer(async (req, res) => {
    await sendWebResponse(await handle(toWebRequest(req, res), req, res), res);
  });
  /* Longer than any test runs, so a body left on the connection shows up as a
     stall rather than as the server closing the socket. */
  server.keepAliveTimeout = 60_000;
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

const refusal = () => Response.json({ success: false }, { status: 413 });

describe("a body the handler never reads", () => {
  it("reaches a browser's refusal while it is still uploading", async () => {
    const port = await serve(async () => refusal());

    const answer = await sendLikeABrowser(port, { ...UPLOAD, bytes: SIXTEEN_MB });

    expect(answer.error).toBeUndefined();
    expect(answer.status).toBe(413);
    expect(answer.elapsedMs).toBeLessThan(3000);
  }, 10_000);

  it("is left to the server even for a chunked upload", async () => {
    const port = await serve(async () => refusal());

    const answer = await sendLikeABrowser(port, { ...UPLOAD, bytes: SIXTEEN_MB, chunked: true });

    expect(answer.status).toBe(413);
    expect(answer.elapsedMs).toBeLessThan(3000);
  }, 10_000);
});

describe("a body the handler stops reading", () => {
  it("is discarded rather than cutting the connection the answer travels on", async () => {
    const port = await serve(async (request) => {
      const reader = request.body!.getReader();
      await reader.read();
      await reader.cancel();
      return refusal();
    });

    const answer = await sendLikeABrowser(port, { ...UPLOAD, bytes: SIXTEEN_MB, chunked: true });

    expect(answer.error).toBeUndefined();
    expect(answer.status).toBe(413);
  }, 10_000);
});

describe("a body the handler reads", () => {
  it("arrives whole", async () => {
    let received = 0;
    const port = await serve(async (request) => {
      received = (await request.arrayBuffer()).byteLength;
      return Response.json({ received });
    });

    const answer = await sendLikeABrowser(port, { ...UPLOAD, bytes: 3 * 1_048_576 });

    expect(answer.status).toBe(200);
    expect(received).toBe(3 * 1_048_576);
  }, 10_000);

  it("fails when the client leaves before sending all of it", async () => {
    let failure: unknown;
    const port = await serve(async (request) => {
      failure = await request.arrayBuffer().catch((error: unknown) => error);
      return refusal();
    });

    const socket = connect(port, "127.0.0.1");
    socket.write(
      "POST /api/request HTTP/1.1\r\nhost: x\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.destroy();

    await expect.poll(() => failure, { timeout: 2000 }).toBeInstanceOf(Error);
  });
});
