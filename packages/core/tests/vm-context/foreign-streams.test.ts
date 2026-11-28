/**
 * Answers read where the global classes of web streams are another
 * implementation's than the bodies Node's fetch makes, as under jest-expo,
 * whose setup makes them the polyfill Metro puts in a React Native app. A
 * body piped through one of the global classes failed a call with a signal
 * or a timeout with a `TypeError`, "The \"transform.readable\" property must
 * be an instance of ReadableStream", and a download counted or a stream
 * read whole alike; the HTTP transport's answer of events failed so too,
 * and its connection waited on with nothing said. A body is read with its
 * own reader, which every implementation has alike.
 */
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import { isAbortError } from "../../src/errors";
import { isHTTPError } from "../../src/errors/http-error";
import type { DownloadProgress } from "../../src/http-client/types";
import { readAnswer } from "../../src/realtime/ws-http/http-answer";
import { wholeBody } from "../../src/utils/whole-body";
import { type ReceivedRequest, startUpstream, type Upstream } from "../helpers/upstream";

const { endpoint, stream } = courier();
const ROWS = [{ slug: "a" }, { slug: "b" }];
const PIECE = new Uint8Array(32 * 1024).fill(7);
const encoder = new TextEncoder();

let upstream: Upstream;
let held: ServerResponse | undefined;

beforeEach(async () => {
  upstream = await startUpstream(answer);
});

afterEach(async () => {
  held = undefined;
  vi.restoreAllMocks();
  await upstream.close();
});

function answer(request: ReceivedRequest, res: ServerResponse): void {
  switch (request.url) {
    case "/rows":
      json(res, 200, ROWS);
      return;
    case "/busy":
      json(res, 503, { code: "busy" });
      return;
    case "/declared":
      res.writeHead(200, { "content-length": String(2 * PIECE.byteLength) });
      res.write(PIECE);
      res.end(PIECE);
      return;
    case "/undeclared":
      res.writeHead(200);
      res.write(PIECE);
      res.end(PIECE);
      return;
    case "/held":
      res.writeHead(200);
      res.write(PIECE);
      held = res;
      return;
    case "/upload":
      json(res, 200, { bytes: request.body.byteLength, text: request.body.toString() });
      return;
    case "/events":
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end('data: {"n":1}\n\ndata: {"n":2}\n\nevent: courier:complete\ndata: \n\n');
      return;
    case "/transport":
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('event: open\ndata: {"token":"t1","ackBytes":1024,"maxBytes":4096}\n\n');
      res.write("id: 1\ndata: hello\n\n");
      res.end('event: close\ndata: {"code":1000,"reason":"done"}\n\n');
      return;
    default:
      res.writeHead(404);
      res.end();
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
  });
  res.end(body);
}

function api(options: { timeout?: number } = {}) {
  return createCaller(
    defineApi({
      baseURL: upstream.url,
      ...options,
      endpoints: {
        rows: endpoint.get("rows").response<typeof ROWS>(),
        busy: endpoint.get("busy"),
        declared: endpoint.get("declared").response<ArrayBuffer | Blob>(),
        undeclared: endpoint.get("undeclared").response<ArrayBuffer | Blob>(),
        held: endpoint.get("held"),
        upload: endpoint.post("upload").variables<ReadableStream<Uint8Array>>(),
        events: stream.response<{ n: number }>().get("events"),
      },
    }),
  );
}

/* A stream of the global class, as an app's code makes one there. */
function globalStream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function textOf(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    text += decoder.decode(read.value, { stream: true });
  }
  return text + decoder.decode();
}

it("runs where Node's bodies are no streams of the global class", () => {
  expect(new Response("x").body instanceof ReadableStream).toBe(false);
});

describe("a call", () => {
  it("reads its answer when given a signal", async () => {
    const signal = new AbortController().signal;

    await expect(api().rows.with({ signal })()).resolves.toEqual(ROWS);
  });

  it("reads its answer under its API's timeout", async () => {
    await expect(api({ timeout: 5000 }).rows()).resolves.toEqual(ROWS);
  });

  it("reads a refusal as an HTTP error that holds the server's data", async () => {
    const signal = new AbortController().signal;

    const error = await api()
      .busy.with({ signal, retry: false })()
      .catch((caught: unknown) => caught);

    expect(isHTTPError(error)).toBe(true);
    expect(error).toMatchObject({ status: 503, data: { code: "busy" } });
  });

  it.each([
    ["declared", "arrayBuffer"],
    ["undeclared", "blob"],
  ] as const)("counts its download to its end, its length %s, read as %s", async (name, form) => {
    const events: DownloadProgress[] = [];

    const data = await api()[name].with({
      responseType: form,
      onDownloadProgress: (p: DownloadProgress) => events.push(p),
    })();

    expect(new Uint8Array(await new Response(data).arrayBuffer())).toEqual(
      new Uint8Array([...PIECE, ...PIECE]),
    );
    expect(events.at(-1)).toEqual({
      percent: 1,
      transferredBytes: 2 * PIECE.byteLength,
      totalBytes: 2 * PIECE.byteLength,
    });
  });

  it("gives up an answer its signal cuts, and lets the body go", async () => {
    const controller = new AbortController();
    const call = api().held.with({
      signal: controller.signal,
      onDownloadProgress: () => controller.abort(new Error("left the page")),
    })();

    const error = await call.catch((caught: unknown) => caught);

    expect(isAbortError(error)).toBe(true);
    await vi.waitFor(() => expect(held?.destroyed).toBe(true));
  });
});

describe("a call that hands its answer over as a stream", () => {
  it("hands over the body as fetch made it, when nothing counts it", async () => {
    const body = (await api().declared.with({ stream: true })()) as ReadableStream<Uint8Array>;

    expect((await textOf(body)).length).toBe(2 * PIECE.byteLength);
  });

  it("hands over a stream of the global class, counted as it is read", async () => {
    const events: DownloadProgress[] = [];

    const body = (await api().undeclared.with({
      stream: true,
      onDownloadProgress: (p: DownloadProgress) => events.push(p),
    })()) as ReadableStream<Uint8Array>;

    expect(body).toBeInstanceOf(ReadableStream);
    expect((await textOf(body)).length).toBe(2 * PIECE.byteLength);
    expect(events.at(-1)?.percent).toBe(1);
  });
});

describe("a stream sent as a request's body", () => {
  it("reaches the server whole when it is of the global class", async () => {
    await expect(api().upload(globalStream("ab", "cd"))).resolves.toEqual({
      bytes: 4,
      text: "abcd",
    });
  });

  it("reaches the server whole when Node's fetch made it", async () => {
    const body = new Response("abcd").body as ReadableStream<Uint8Array>;

    await expect(api().upload(body)).resolves.toEqual({ bytes: 4, text: "abcd" });
  });
});

describe("a stream of events", () => {
  it("is read event by event", async () => {
    const data: unknown[] = [];

    for await (const event of await api().events()) data.push(event.data);

    expect(data).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe("an answer of the HTTP transport", () => {
  it("is read part by part from the body Node's fetch made", async () => {
    const response = await fetch(`${upstream.url}/transport`);
    const parts = {
      received: vi.fn(),
      opened: vi.fn(),
      frame: vi.fn(),
      closed: vi.fn(),
      refused: vi.fn(),
    };

    await readAnswer(
      response.body as ReadableStream<Uint8Array>,
      parts,
      new AbortController().signal,
    );

    expect(parts.opened).toHaveBeenCalledWith({ token: "t1", ackBytes: 1024, maxBytes: 4096 });
    expect(parts.frame).toHaveBeenCalledWith("hello", 1);
    expect(parts.closed).toHaveBeenCalledWith(1000, "done");
    const received = parts.received.mock.calls.reduce((sum, [bytes]) => sum + bytes, 0);
    expect(received).toBe(Number(response.headers.get("content-length") ?? received));
  });
});

describe("a stream read whole, for what sends no stream", () => {
  it("holds what a stream of the global class held", async () => {
    const whole = await wholeBody(globalStream("ab", "cd"), new AbortController().signal);

    expect(await new Response(whole).text()).toBe("abcd");
  });

  it("holds what a body of Node's fetch held", async () => {
    const body = new Response("abcd").body as ReadableStream<Uint8Array>;

    const whole = await wholeBody(body, new AbortController().signal);

    expect(await new Response(whole).text()).toBe("abcd");
  });
});
