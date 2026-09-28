/**
 * A real HTTP server that records every request it receives and answers
 * each with a fixed JSON body.
 */
import { createServer, type IncomingHttpHeaders } from "node:http";

/** One request as it arrived. */
export interface RecordedRequest {
  method: string;
  path: string;
  /** The query string's entries, in order. */
  query: [string, string][];
  contentType: string | null;
  /** Every header, by its lower-case name. */
  headers: IncomingHttpHeaders;
  body: string;
}

/** The server, and what it has seen. */
export interface UpstreamServer {
  /** Its origin, `http://127.0.0.1:<port>`. */
  origin: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

/** An answer that is not the JSON every other path gets. */
export interface RawAnswer {
  contentType: string;
  body: string;
}

/**
 * Start a server on a free port of the loopback interface.
 *
 * @param answer - The JSON every request is answered with
 * @param byPath - Paths answered otherwise, with their content type and body
 * @returns The running server
 */
export async function startUpstreamServer(
  answer: unknown = {},
  byPath: Readonly<Record<string, RawAnswer>> = {},
): Promise<UpstreamServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: req.method ?? "",
      path: url.pathname,
      query: [...url.searchParams.entries()],
      contentType: req.headers["content-type"] ?? null,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    const raw = Object.hasOwn(byPath, url.pathname) ? byPath[url.pathname] : undefined;
    res.setHeader("content-type", raw?.contentType ?? "application/json");
    res.end(raw ? raw.body : JSON.stringify(answer));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the server has no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
