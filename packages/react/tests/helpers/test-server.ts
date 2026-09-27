import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** One request the server received, as it arrived. */
export interface SeenRequest {
  method: string;
  path: string;
  query: URLSearchParams;
}

/** A running server and what it has seen so far. */
export interface TestServer {
  /** `http://127.0.0.1:<port>` */
  origin: string;
  /** Every request, in arrival order */
  requests: SeenRequest[];
  /** Paths of requests whose client went away before the answer was written */
  aborted: string[];
  close: () => Promise<void>;
}

export type TestRoute = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) => void | Promise<void>;

/**
 * Start a real HTTP server on a free port that answers with `route`.
 *
 * Records each request and each one abandoned by its client, so a test can
 * tell a request that was cancelled on the wire from one that ran to its end.
 *
 * @param route - Writes the answer for every request
 * @returns The server's origin, its records, and a way to stop it
 * @example
 * const server = await startTestServer((_req, res) => sendJson(res, { ok: true }));
 * await fetch(`${server.origin}/ping`);
 * await server.close();
 */
export async function startTestServer(route: TestRoute): Promise<TestServer> {
  const requests: SeenRequest[] = [];
  const aborted: string[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({ method: request.method ?? "GET", path: url.pathname, query: url.searchParams });
    response.on("close", () => {
      if (!response.writableFinished) aborted.push(url.pathname);
    });
    void route(request, response, url);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    aborted,
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Write `body` as a JSON answer.
 *
 * @param response - The answer to write to
 * @param body - Any JSON-serialisable value
 * @param status - HTTP status, 200 by default
 * @example
 * sendJson(res, [{ id: 1 }]);
 */
export function sendJson(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
