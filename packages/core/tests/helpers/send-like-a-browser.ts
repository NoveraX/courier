import { once } from "node:events";
import { connect } from "node:net";

export interface BrowserUpload {
  /** Request line method, e.g. `POST`. */
  method: string;
  /** Header lines beyond `Host`, without the framing ones. */
  headers: Record<string, string>;
  /** Body size in bytes. */
  bytes: number;
  /** Send the body chunked rather than declaring its length. */
  chunked?: boolean;
  /** Request target; the proxy route naming `api.upload` unless given. */
  path?: string;
}

export interface BrowserAnswer {
  /** Status line code, or `undefined` when no response arrived. */
  status: number | undefined;
  /** Raw response text, head and body. */
  text: string;
  /** Milliseconds from the first byte sent to the response read. */
  elapsedMs: number;
  /** The socket error that ended the exchange, if one did. */
  error: Error | undefined;
}

const CHUNK = new Uint8Array(65_536).fill(0x20);

/**
 * Send a request the way a browser does: the whole body first, and only then
 * the response.
 *
 * `curl` and Node's client read an early answer while still uploading; a
 * browser does not look at the response until its upload is done or the
 * connection closes. A server that answers without reading the body, and
 * then never reads it, therefore keeps a browser waiting on its own upload.
 *
 * @param port - Port of the server on 127.0.0.1
 * @param upload - What to send
 * @returns What came back, and how long it took
 */
export async function sendLikeABrowser(port: number, upload: BrowserUpload): Promise<BrowserAnswer> {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  socket.pause();

  let error: Error | undefined;
  socket.on("error", (cause: Error) => {
    error = cause;
  });

  const started = performance.now();
  const framing = upload.chunked
    ? { "transfer-encoding": "chunked" }
    : { "content-length": String(upload.bytes) };
  const head = Object.entries({ host: `127.0.0.1:${port}`, ...upload.headers, ...framing })
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
  const path = upload.path ?? "/api/request?_s=api&_m=upload";
  socket.write(`${upload.method} ${path} HTTP/1.1\r\n${head}\r\n`);

  for (let sent = 0; sent < upload.bytes && !error && !socket.destroyed; sent += CHUNK.length) {
    const piece = CHUNK.subarray(0, Math.min(CHUNK.length, upload.bytes - sent));
    const framed = upload.chunked ? [`${piece.length.toString(16)}\r\n`, piece, "\r\n"] : [piece];
    let flushed = true;
    for (const part of framed) flushed = socket.write(part);
    if (!flushed) await drainedOrClosed(socket);
  }
  if (upload.chunked && !socket.destroyed) socket.write("0\r\n\r\n");

  return readAnswer(socket, started, () => error);
}

/** Wait until the socket takes more, or can take nothing at all. */
function drainedOrClosed(socket: ReturnType<typeof connect>): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      socket.off("drain", done);
      socket.off("close", done);
      resolve();
    };
    socket.once("drain", done);
    socket.once("close", done);
  });
}

/** Whether a whole response is in: its head, and a body framed either way. */
function isComplete(text: string): boolean {
  const end = text.indexOf("\r\n\r\n");
  if (end === -1) return false;
  const head = text.slice(0, end).toLowerCase();
  const body = text.slice(end + 4);
  if (head.includes("transfer-encoding: chunked")) return body.endsWith("0\r\n\r\n");
  const length = /content-length: (\d+)/.exec(head)?.[1];
  return length !== undefined && Buffer.byteLength(body) >= Number(length);
}

/** Read until a whole response is in, or the socket ends. */
async function readAnswer(
  socket: ReturnType<typeof connect>,
  started: number,
  failure: () => Error | undefined,
): Promise<BrowserAnswer> {
  let text = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    text += chunk;
    if (isComplete(text)) socket.destroy();
  });
  socket.resume();
  if (!socket.destroyed) await once(socket, "close");

  const status = /^HTTP\/1\.1 (\d{3})/.exec(text)?.[1];
  return {
    status: status === undefined ? undefined : Number(status),
    text,
    elapsedMs: performance.now() - started,
    error: failure(),
  };
}
