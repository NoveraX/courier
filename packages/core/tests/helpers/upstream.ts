import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** A request as the upstream received it. */
export interface ReceivedRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

/** A real HTTP server standing in for the API a source points at. */
export interface Upstream {
  /** `http://127.0.0.1:<port>` */
  url: string;
  /** Every request that reached it, in arrival order. */
  received: ReceivedRequest[];
  close(): Promise<void>;
}

type Answer = (request: ReceivedRequest, res: ServerResponse) => void;

/**
 * Start an upstream on a free port.
 *
 * The request body is read in full before `answer` runs, so the answer can
 * depend on it and the test can inspect exactly what arrived.
 *
 * @param answer - Writes the response
 * @returns The running upstream
 */
export async function startUpstream(answer: Answer): Promise<Upstream> {
  const received: ReceivedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const request = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      received.push(request);
      answer(request, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Answer with the request as JSON: method, url and headers. */
export function echo(request: ReceivedRequest, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ method: request.method, url: request.url, headers: request.headers }));
}
