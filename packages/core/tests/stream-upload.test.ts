/**
 * An upload the proxy sends on as it arrives (`uploadMode: "stream"`): what
 * the upstream receives, and how each way the upload can end is answered —
 * the client's body failing partway is the client's refusal, not a 502.
 */
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { BodyError } from "../src/adapter/body-error";
import { createHandler } from "../src/adapter/create-handler";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { NetworkError } from "../src/errors";
import { defineMiddleware } from "../src/middleware/define";
import { retryMiddleware } from "../src/middleware/retry";
import { chunked, concat } from "./helpers/multipart-fixtures";

const { endpoint } = courier();
const B = "----courier-client";

const field = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const fileHead = (name: string, filename: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
  "Content-Type: application/zip\r\n\r\n";
const close = `--${B}--\r\n`;

/**
 * What the upstream made of one request: its headers, its bytes, and whether
 * it arrived whole. A body that fails before fetch has connected never
 * reaches the upstream at all.
 */
interface Arrival {
  headers: IncomingHttpHeaders;
  body: Buffer;
  complete: boolean;
}

let upstream: Server | undefined;
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  upstream?.closeAllConnections();
  await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
  upstream = undefined;
});

/**
 * Start an upstream that answers with `answer`, and the proxy in front of it.
 *
 * @param upload - The endpoint the upload is sent to, with what it adds
 * @returns The proxy's POST entry point, and each request's arrival once the upstream is done with it
 */
async function proxyTo(
  answer: (req: IncomingMessage, res: ServerResponse) => void,
  config: HandlerConfig = {},
  upload = endpoint.post("upload"),
): Promise<{ handlePost: (request: Request) => Promise<Response>; arrivals: Promise<Arrival>[] }> {
  const arrivals: Promise<Arrival>[] = [];
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    arrivals.push(
      new Promise((resolve) => {
        req.once("close", () =>
          resolve({ headers: req.headers, body: Buffer.concat(chunks), complete: req.complete }),
        );
      }),
    );
    answer(req, res);
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  const api = defineApi({
    baseURL: `http://127.0.0.1:${port}`,
    groups: {
      files: defineGroup({
        prefix: "files",
        expose: true,
        endpoints: { upload },
      }),
    },
  });
  const { handlePost } = createHandler({ sources: { api }, uploadMode: "stream", ...config });
  return { handlePost, arrivals };
}

/** A browser's upload of `body`, a kilobyte at a time, declaring `declared` bytes. */
function upload(body: Uint8Array<ArrayBuffer>, declared = body.length) {
  const { stream, pulls } = chunked(
    body,
    Array.from({ length: Math.ceil(body.length / 1024) }, (_, at) => at * 1024),
  );
  const request = new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": `multipart/form-data; boundary=${B}`,
      "content-length": String(declared),
    },
    body: stream,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
  return { request, pulls, chunks: Math.ceil(body.length / 1024) };
}

/** A browser's upload of `body` in eight pieces, `gapMs` apart, as a slow link sends one. */
function slowUpload(body: Uint8Array<ArrayBuffer>, gapMs: number): Request {
  const piece = Math.ceil(body.length / 8);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        if (sent >= body.length) return controller.close();
        if (sent > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
        controller.enqueue(body.slice(sent, sent + piece));
        sent += piece;
      },
    },
    { highWaterMark: 0 },
  );
  return new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": `multipart/form-data; boundary=${B}`,
      "content-length": String(body.length),
    },
    body: stream,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

/**
 * A browser's upload that stops partway, as on a link gone quiet: it sends
 * `sent` a kilobyte at a time, declaring `declared` bytes, then neither sends
 * more nor ends. However much the sockets hold, the upstream never has it
 * whole; the client leaves when `signal` aborts.
 */
function stalledUpload(
  sent: Uint8Array<ArrayBuffer>,
  declared: number,
  signal: AbortSignal,
): Request {
  let at = 0;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        if (at >= sent.length) await new Promise(() => {});
        controller.enqueue(sent.slice(at, at + 1024));
        at += 1024;
      },
    },
    { highWaterMark: 0 },
  );
  return new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": `multipart/form-data; boundary=${B}`,
      "content-length": String(declared),
    },
    body: stream,
    signal,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

/** An upstream that reads the whole upload, then answers 200. */
const readsAll = (_req: IncomingMessage, res: ServerResponse): void => {
  _req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
};

const logged = (text: string): boolean =>
  warn.mock.calls.some((call) => call.map(String).join(" ").includes(text));

describe("an upload sent on as it arrives", () => {
  it("reaches the upstream as the caller's form, under a boundary of the proxy's own, chunked", async () => {
    const { handlePost, arrivals } = await proxyTo(readsAll);
    const { request } = upload(
      concat(
        field("_options", "{}"),
        field("note", "hi"),
        fileHead("file", "a.zip"),
        "z".repeat(70_000),
        "\r\n",
        close,
      ),
    );

    const response = await handlePost(request);
    const arrival = await arrivals[0];

    expect(response.status).toBe(200);
    expect(arrival?.complete).toBe(true);
    expect(arrival?.headers["content-type"]).toMatch(
      /^multipart\/form-data; boundary=----courier-/,
    );
    expect(arrival?.headers["content-type"]).not.toContain(B);
    expect(arrival?.headers["transfer-encoding"]).toBe("chunked");
    expect(arrival?.headers["content-length"]).toBeUndefined();
    const form = await new Response(new Uint8Array(arrival?.body ?? []), {
      headers: { "content-type": arrival?.headers["content-type"] ?? "" },
    }).formData();
    expect([...form.keys()]).toEqual(["note", "file"]);
    expect(form.get("note")).toBe("hi");
    expect((form.get("file") as File).size).toBe(70_000);
  });

  it("answers 413 BODY_INCOMPLETE, not 502, when the client's body ends short partway", async () => {
    const { handlePost, arrivals } = await proxyTo(readsAll);
    const whole = concat(
      field("note", "hi"),
      fileHead("file", "a.zip"),
      "z".repeat(50_000),
      "\r\n",
      close,
    );
    const { request } = upload(whole.slice(0, 30_000), whole.length);

    const response = await handlePost(request);
    const arrived = await Promise.all(arrivals);

    expect(response.status).toBe(413);
    expect(((await response.json()) as { code: string }).code).toBe("BODY_INCOMPLETE");
    expect(arrived.filter((arrival) => arrival.complete)).toEqual([]);
    expect(logged("BODY_INCOMPLETE")).toBe(true);
    expect(logged("Upstream request failed")).toBe(false);
  });

  it("answers 400 BODY_MALFORMED when a later part does not parse, the upstream never told it ended", async () => {
    const { handlePost, arrivals } = await proxyTo(readsAll);
    const { request } = upload(
      concat(
        field("note", "hi"),
        fileHead("file", "a.zip"),
        "z".repeat(20_000),
        "\r\n",
        `--${B}\r\nbroken\r\n\r\nx\r\n`,
        close,
      ),
    );

    const response = await handlePost(request);
    const arrived = await Promise.all(arrivals);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("BODY_MALFORMED");
    expect(arrived.filter((arrival) => arrival.complete)).toEqual([]);
    expect(logged("Upstream request failed")).toBe(false);
  });

  it("passes on an upstream's early answer, the rest of the upload taken off the connection", async () => {
    const { handlePost } = await proxyTo((_req, res) => {
      res.writeHead(413, { "content-type": "application/json" });
      res.end('{"success":false,"message":"too large for the upstream"}');
    });
    const { request, pulls, chunks } = upload(
      concat(field("note", "hi"), fileHead("file", "a.zip"), "z".repeat(2_000_000), "\r\n", close),
    );

    const response = await handlePost(request);

    expect(response.status).toBe(413);
    expect(((await response.json()) as { message: string }).message).toBe(
      "too large for the upstream",
    );
    await expect.poll(pulls, { timeout: 10_000 }).toBe(chunks + 1);
  });

  it("answers 502 when the upstream fails partway, the rest of the upload taken off the connection", async () => {
    const { handlePost } = await proxyTo((req) => {
      let bytes = 0;
      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 100_000) req.socket.destroy();
      });
    });
    const { request, pulls, chunks } = upload(
      concat(field("note", "hi"), fileHead("file", "a.zip"), "z".repeat(2_000_000), "\r\n", close),
    );

    const response = await handlePost(request);

    expect(response.status).toBe(502);
    expect(((await response.json()) as { code: string }).code).toBe("UPSTREAM_UNREACHABLE");
    await expect.poll(pulls, { timeout: 10_000 }).toBe(chunks + 1);
  });

  it("stops the upstream's request when the client leaves partway", async () => {
    let underWay: (request: IncomingMessage) => void = () => {};
    const receiving = new Promise<IncomingMessage>((resolve) => {
      underWay = resolve;
    });
    const { handlePost, arrivals } = await proxyTo((req) => {
      let bytes = 0;
      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 50_000) underWay(req);
      });
    });
    const whole = concat(
      field("note", "hi"),
      fileHead("file", "a.zip"),
      "z".repeat(2_000_000),
      "\r\n",
      close,
    );
    const leaving = new AbortController();
    /* The client sends 100 KB of its form and no more; once the upstream has half of that, it leaves. */
    const request = stalledUpload(whole.slice(0, 100_000), whole.length, leaving.signal);

    const answered = handlePost(request);
    const upstreamRequest = await receiving;
    expect(upstreamRequest.destroyed).toBe(false);
    leaving.abort();
    /* Left open, the upstream's request would wait for the rest of a body that never comes, and the test would run out of time. */
    const response = await answered;
    const arrival = await arrivals[0];

    expect(response.status).toBe(499);
    expect(arrival?.complete).toBe(false);
    expect(logged("Upstream request failed")).toBe(false);
  });

  it("fails the endpoint's call with the body's refusal, not as a network failure", async () => {
    const seen: unknown[] = [];
    const watching = defineMiddleware("watching", "wrap", async (_ctx, next) => {
      try {
        return await next();
      } catch (error) {
        seen.push(error);
        throw error;
      }
    });
    const { handlePost } = await proxyTo(
      readsAll,
      { maxUploadBytes: 64 * 1024 },
      endpoint.post("upload").use(watching),
    );
    const whole = concat(
      field("_options", "{}"),
      fileHead("file", "a.zip"),
      "z".repeat(200_000),
      "\r\n",
      close,
    );
    /* Sent chunked, so the limit is broken partway, once the call is under way. */
    const request = new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": `multipart/form-data; boundary=${B}` },
      body: chunked(whole, [0, 16_384, 32_768, 65_536, 131_072]).stream,
      // @ts-expect-error -- required by the platform for a streaming body
      duplex: "half",
    });

    const response = await handlePost(request);

    expect(response.status).toBe(413);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(BodyError);
    expect(seen[0]).toMatchObject({ code: "BODY_TOO_LARGE" });
    expect(seen[0]).not.toBeInstanceOf(NetworkError);
  });

  it("starts the call's timeout once the upload is sent whole, so a slow client is not cut off", async () => {
    const { handlePost } = await proxyTo(readsAll, {}, endpoint.post("upload").timeout(300));
    const body = concat(
      field("_options", "{}"),
      fileHead("file", "a.zip"),
      "z".repeat(64_000),
      "\r\n",
      close,
    );

    /* Eight pieces 100 ms apart: well past the call's 300 ms, well within the body's idle limit. */
    const response = await handlePost(slowUpload(body, 100));

    expect(response.status).toBe(200);
    expect(logged("Upstream request failed")).toBe(false);
  });

  it("answers 408 BODY_TIMEOUT when a deadline runs out before the upload is sent whole", async () => {
    const { handlePost } = await proxyTo(
      readsAll,
      {},
      endpoint.post("upload").use(retryMiddleware({ deadline: 300 })),
    );
    const body = concat(
      field("_options", "{}"),
      fileHead("file", "a.zip"),
      "z".repeat(64_000),
      "\r\n",
      close,
    );

    const response = await handlePost(slowUpload(body, 100));

    expect(response.status).toBe(408);
    expect(((await response.json()) as { code: string }).code).toBe("BODY_TIMEOUT");
    expect(logged("Upstream request failed")).toBe(false);
  });

  it("still times out an upstream that leaves the upload, sent whole, unanswered", async () => {
    const silent = (req: IncomingMessage): void => {
      req.resume();
    };
    const { handlePost } = await proxyTo(silent, {}, endpoint.post("upload").timeout(300));
    const body = concat(
      field("_options", "{}"),
      fileHead("file", "a.zip"),
      "z".repeat(8_000),
      "\r\n",
      close,
    );

    const response = await handlePost(upload(body).request);

    expect(response.status).toBe(504);
    expect(((await response.json()) as { code: string }).code).toBe("UPSTREAM_TIMEOUT");
  });

  it("is refused before the call runs when its options do not parse, its body taken off", async () => {
    const run = vi.fn(readsAll);
    const { handlePost } = await proxyTo(run);
    const { request, pulls, chunks } = upload(
      concat(
        field("_options", "not json"),
        fileHead("file", "a.zip"),
        "z".repeat(100_000),
        "\r\n",
        close,
      ),
    );

    const response = await handlePost(request);

    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    await expect.poll(pulls).toBe(chunks + 1);
  });
});
