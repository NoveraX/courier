import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** What an upstream saw of one request. */
export interface SeenRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  /** Milliseconds since the upstream started listening. */
  at: number;
}

/** A real HTTP server on a free local port, recording every request it gets. */
export interface Upstream {
  url: string;
  seen: SeenRequest[];
  close(): Promise<void>;
}

/**
 * Start an upstream that answers each request with `respond`.
 *
 * `respond` receives the zero-based number of the request, so a test can
 * script a sequence of answers, and it may hold a response open.
 */
export async function startUpstream(
  respond: (req: IncomingMessage, res: ServerResponse, index: number) => void,
): Promise<Upstream> {
  const seen: SeenRequest[] = [];
  const started = Date.now();
  const server = createServer((req, res) => {
    seen.push({
      method: req.method ?? "",
      url: req.url ?? "",
      headers: req.headers,
      at: Date.now() - started,
    });
    respond(req, res, seen.length - 1);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Answer with a JSON body and the given status. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
