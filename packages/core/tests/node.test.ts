import { once } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "../src/node";
import { buildProxySSEUrl } from "../src/realtime/caller-sse";
import { _resetSourcesForTests, registerSources } from "../src/sources";

function mockIncomingMessage(opts: {
  host?: string | string[] | undefined;
  encrypted?: boolean;
}): IncomingMessage {
  return {
    headers: { host: opts.host },
    socket: { encrypted: opts.encrypted ?? false },
  } as unknown as IncomingMessage;
}

describe("extractOriginFromNodeRequest", () => {
  it("returns http origin for plain HTTP with Host header", () => {
    const req = mockIncomingMessage({ host: "localhost:3000" });
    expect(extractOriginFromNodeRequest(req)).toBe("http://localhost:3000");
  });

  it("returns https origin when socket is encrypted", () => {
    const req = mockIncomingMessage({ host: "app.example.com", encrypted: true });
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("preserves host with port", () => {
    const req = mockIncomingMessage({ host: "localhost:4330" });
    expect(extractOriginFromNodeRequest(req)).toBe("http://localhost:4330");
  });

  it("preserves bare hostname (implicit port)", () => {
    const req = mockIncomingMessage({ host: "app.example.com", encrypted: true });
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("returns undefined when Host header is missing", () => {
    const req = mockIncomingMessage({ host: undefined });
    expect(extractOriginFromNodeRequest(req)).toBeUndefined();
  });

  it("returns undefined when Host header is an array (malformed HTTP/1.0)", () => {
    const req = mockIncomingMessage({ host: ["a.com", "b.com"] });
    expect(extractOriginFromNodeRequest(req)).toBeUndefined();
  });

  it("takes the scheme and host a local proxy forwards, as its client used them", () => {
    const req = {
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.example.com",
      },
      socket: { encrypted: false, remoteAddress: "10.0.3.7" },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("takes the client-facing hop of a forwarded chain", () => {
    const req = {
      headers: { host: "app.example.com", "x-forwarded-proto": "https, http" },
      socket: { encrypted: false, remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("https://app.example.com");
  });

  it("ignores forwarded headers from a caller on a public address", () => {
    const req = {
      headers: {
        host: "internal-service:8080",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "victim.example.com",
      },
      socket: { encrypted: false, remoteAddress: "203.0.113.9" },
    } as unknown as IncomingMessage;
    expect(extractOriginFromNodeRequest(req)).toBe("http://internal-service:8080");
  });
});

const CHUNK = new Uint8Array(64 * 1024);
const BODY_CAP = 256 * 1024 * 1024;

let server: Server | undefined;
let client: Socket | undefined;

afterEach(async () => {
  _resetSourcesForTests();
  client?.destroy();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  client = undefined;
});

/** A body that produces as fast as it is read, up to `BODY_CAP` bytes. */
function endlessBody(counter: { pulled: number }): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      counter.pulled += CHUNK.byteLength;
      if (counter.pulled > BODY_CAP) controller.close();
      else controller.enqueue(CHUNK);
    },
  });
}

/** Serve `respond` and open a raw client that sends a request, then stops reading. */
async function stalledClient(
  respond: (res: Parameters<typeof sendWebResponse>[1], req: IncomingMessage) => void,
  path = "/",
) {
  server = createServer((req, res) => respond(res, req));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  client = connect(port, "127.0.0.1");
  await once(client, "connect");
  client.write(
    `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAccept: text/event-stream\r\n\r\n`,
  );
  client.pause();
  return client;
}

describe("sendWebResponse", () => {
  it("stops reading the body while the client is not reading", async () => {
    const counter = { pulled: 0 };
    await stalledClient((res) => {
      void sendWebResponse(new Response(endlessBody(counter)), res);
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(counter.pulled).toBeGreaterThan(0);
    expect(counter.pulled).toBeLessThan(32 * 1024 * 1024);
  });

  it("finishes when the client leaves while the body waits for it", async () => {
    const counter = { pulled: 0 };
    let sending: Promise<void> | undefined;
    const socket = await stalledClient((res) => {
      sending = sendWebResponse(new Response(endlessBody(counter)), res);
    });
    await expect.poll(() => counter.pulled).toBeGreaterThan(0);

    socket.destroy();

    await expect(sending).resolves.toBeUndefined();
    expect(counter.pulled).toBeLessThan(32 * 1024 * 1024);
  });

  it("pauses a stream endpoint whose client stopped reading", async () => {
    let yielded = 0;
    const feed = courier()
      .stream.response<{ pad: string }>()
      .implement(async function* () {
        const pad = "x".repeat(4096);
        for (; yielded < 10_000; yielded++) {
          await new Promise((resolve) => setImmediate(resolve));
          yield { data: { pad } };
        }
      });
    registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as never);
    const { handleSSE } = createHandler();
    const path = new URL(buildProxySSEUrl("http://localhost/", "api", "live", "feed")).search;
    await stalledClient(async (res, req) => {
      await sendWebResponse(await handleSSE(toWebRequest(req, res)), res);
    }, `/${path}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(yielded).toBeGreaterThan(0);
    expect(yielded * 4096).toBeLessThan(16 * 1024 * 1024);
  });
});
