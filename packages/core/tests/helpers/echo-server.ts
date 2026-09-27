import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** One request as the upstream received it. */
export interface ReceivedRequest {
  method: string;
  /** Path and query exactly as they arrived on the request line. */
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface EchoServer {
  /** Origin to use as a source's `baseURL`, e.g. `http://127.0.0.1:53211`. */
  origin: string;
  /** Every request received so far, oldest first. */
  received: ReceivedRequest[];
  /** The most recent request; fails the test when there is none. */
  last(): ReceivedRequest;
  close(): Promise<void>;
}

/**
 * A real HTTP upstream that records what reaches it and answers `{ ok: true }`.
 *
 * Tests assert on the bytes and headers the server saw rather than on the
 * options handed to `fetch`, so a request that looks right before it is sent
 * but arrives mangled still fails.
 */
export async function startEchoServer(): Promise<EchoServer> {
  const received: ReceivedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    received,
    last: () => {
      const request = received.at(-1);
      if (!request) throw new Error("the upstream received no request");
      return request;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
