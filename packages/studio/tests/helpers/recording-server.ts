/**
 * An HTTP server that answers from a script and records every request, so a
 * test can see what a generated client actually put on the wire.
 */
import { createServer } from "node:http";

export interface RecordedRequest {
  method: string;
  path: string;
  /** Query entries in order, a repeated key once per value. */
  query: [string, string][];
  contentType: string | null;
  body: string;
}

export interface ScriptedReply {
  status?: number;
  contentType?: string;
  body?: string;
}

export interface RecordingServer {
  /** Origin the server listens on, without a trailing slash. */
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

/**
 * Start a server on an ephemeral port.
 *
 * @param reply - Answers each request; its body is sent as written
 * @returns The server's origin, what it received, and a way to stop it
 * @example
 * ```ts
 * const server = await startRecordingServer(() => ({ status: 204 }));
 * await fetch(`${server.url}/files/1`, { method: "DELETE" });
 * server.requests[0]?.method; // "DELETE"
 * await server.close();
 * ```
 */
export async function startRecordingServer(
  reply: (request: RecordedRequest) => ScriptedReply,
): Promise<RecordingServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = new URL(req.url ?? "/", "http://recording.test");
    const recorded: RecordedRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      query: [...url.searchParams.entries()],
      contentType: req.headers["content-type"] ?? null,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    requests.push(recorded);

    const answer = reply(recorded);
    /* No connection is kept for the next call: a client reusing one the server closes as idle meets ECONNRESET, which a busy machine's late timers make likely. */
    const headers = {
      connection: "close",
      ...(answer.contentType ? { "content-type": answer.contentType } : {}),
    };
    res.writeHead(answer.status ?? 200, headers);
    res.end(answer.body ?? "");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the server has no port");

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((done, fail) => {
        server.closeAllConnections();
        server.close((error) => (error ? fail(error) : done()));
      }),
  };
}
