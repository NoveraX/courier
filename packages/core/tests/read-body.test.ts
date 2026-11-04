/**
 * A request body as the server reads it: held to its size, to its own
 * Content-Length and to the time it may take, its chunks passed on uncopied.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { BodyError } from "../src/adapter/body-error";
import { requestBodyStream } from "../src/adapter/read-body";

afterEach(() => {
  vi.useRealTimers();
});

/** A source that hands out `chunks` one per pull, counting the pulls. */
function source(chunks: Uint8Array[]): { stream: ReadableStream<Uint8Array>; pulls: () => number } {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[pulls];
        pulls += 1;
        if (chunk === undefined) controller.close();
        else controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls };
}

/** A source that never sends a byte. */
function stalled(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>(
    { pull: () => new Promise(() => {}) },
    { highWaterMark: 0 },
  );
}

function requestOf(
  body: ReadableStream<Uint8Array> | null,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Request {
  return new Request("http://localhost/api/request?_s=api&_m=upload", {
    method: "POST",
    headers,
    body,
    signal,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

const bytes = (size: number): Uint8Array => new Uint8Array(size).fill(0x61);

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

/** What the stream fails with, read to its end. */
async function refusalOf(stream: ReadableStream<Uint8Array>): Promise<BodyError> {
  const error: unknown = await readAll(stream).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BodyError)) throw new Error(`Expected a BodyError, got ${String(error)}`);
  return error;
}

describe("requestBodyStream", () => {
  it("passes each chunk on as it came, without copying it", async () => {
    const chunks = [bytes(3), bytes(5)];
    const request = requestOf(source(chunks).stream, { "content-length": "8" });

    const read = await readAll(requestBodyStream(request, { maxBytes: 8 }));

    expect(read).toHaveLength(2);
    expect(read[0]).toBe(chunks[0]);
    expect(read[1]).toBe(chunks[1]);
  });

  it("reads no chunk ahead of its reader", async () => {
    const { stream, pulls } = source([bytes(1), bytes(1), bytes(1)]);
    const reader = requestBodyStream(requestOf(stream), { maxBytes: 3 }).getReader();

    await reader.read();

    expect(pulls()).toBe(1);
  });

  it("refuses a declared body over the limit before reading any of it", async () => {
    const { stream, pulls } = source([bytes(64)]);
    const request = requestOf(stream, { "content-length": "64" });

    const error = await refusalOf(requestBodyStream(request, { maxBytes: 32 }));

    expect(error).toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
    expect(error.message).toBe("Request body exceeds 32 bytes");
    /* The rest is taken off the connection, never handed to the reader. */
    await expect.poll(pulls).toBeGreaterThan(0);
  });

  it("refuses an undeclared body at the chunk that crosses the limit, and drains the rest", async () => {
    const { stream, pulls } = source([bytes(20), bytes(20), bytes(20), bytes(20)]);

    const error = await refusalOf(requestBodyStream(requestOf(stream), { maxBytes: 32 }));

    expect(error.code).toBe("BODY_TOO_LARGE");
    await expect.poll(pulls).toBe(5);
  });

  it("refuses a body that ends short of its Content-Length with 413, naming both lengths", async () => {
    const request = requestOf(source([bytes(10)]).stream, { "content-length": "12" });

    const error = await refusalOf(requestBodyStream(request, { maxBytes: 100 }));

    expect(error).toMatchObject({ code: "BODY_INCOMPLETE", status: 413 });
    expect(error.message).toContain("after 10 of the 12 bytes its Content-Length declares");
    expect(error.message).toContain("experimental.proxyClientMaxBodySize");
  });

  it("refuses a body that runs past its Content-Length", async () => {
    const request = requestOf(source([bytes(10), bytes(10)]).stream, { "content-length": "12" });

    const error = await refusalOf(requestBodyStream(request, { maxBytes: 100 }));

    expect(error).toMatchObject({ code: "BODY_MALFORMED", status: 400 });
  });

  it("takes the chunks' framing over a length a chunked request also names", async () => {
    const request = requestOf(source([bytes(10)]).stream, {
      "content-length": "12",
      "transfer-encoding": "chunked",
    });

    const read = await readAll(requestBodyStream(request, { maxBytes: 100 }));

    expect(read).toHaveLength(1);
  });

  it("reads a length repeated as a list as that length", async () => {
    const request = requestOf(source([bytes(4)]).stream, { "content-length": "4, 4" });

    expect(await readAll(requestBodyStream(request, { maxBytes: 4 }))).toHaveLength(1);
  });

  it.each([["4, 5"], [""], ["0x10"], ["1e3"], ["-1"], [" 4 4"]])(
    "refuses a Content-Length of %j as malformed",
    async (header) => {
      const request = requestOf(source([bytes(4)]).stream, { "content-length": header });

      const error = await refusalOf(requestBodyStream(request, { maxBytes: 100 }));

      expect(error).toMatchObject({ code: "BODY_MALFORMED", status: 400 });
    },
  );

  it("refuses a compressed body with 415 and takes one sent as it is", async () => {
    const gzip = requestOf(source([bytes(4)]).stream, { "content-encoding": "gzip" });
    const identity = requestOf(source([bytes(4)]).stream, { "content-encoding": "identity" });

    expect(await refusalOf(requestBodyStream(gzip, { maxBytes: 100 }))).toMatchObject({
      code: "BODY_ENCODING_UNSUPPORTED",
      status: 415,
    });
    expect(await readAll(requestBodyStream(identity, { maxBytes: 100 }))).toHaveLength(1);
  });

  it("reads a request without a body as an empty one, unless it declared a length", async () => {
    const empty = requestOf(null);
    const declared = new Request("http://localhost/", {
      method: "POST",
      headers: { "content-length": "3" },
    });

    expect(await readAll(requestBodyStream(empty, { maxBytes: 1 }))).toEqual([]);
    expect((await refusalOf(requestBodyStream(declared, { maxBytes: 10 }))).code).toBe(
      "BODY_INCOMPLETE",
    );
  });

  it("refuses with 408 a body whose next chunk is 30 s in coming, and lets go of its timers", async () => {
    vi.useFakeTimers();
    const stream = requestBodyStream(requestOf(stalled()), { maxBytes: 10 });
    const refusal = refusalOf(stream);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(await refusal).toMatchObject({ code: "BODY_TIMEOUT", status: 408 });
    expect((await refusal).message).toBe("No part of the request body arrived for 30000 ms");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses with 408 a body still arriving 5 minutes on, however steady its chunks", async () => {
    vi.useFakeTimers();
    let sent = 0;
    const trickle = new ReadableStream<Uint8Array>(
      {
        pull: (controller) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              sent += 1;
              controller.enqueue(bytes(1));
              resolve();
            }, 20_000);
          }),
      },
      { highWaterMark: 0 },
    );
    const refusal = refusalOf(requestBodyStream(requestOf(trickle), { maxBytes: 1_000 }));

    await vi.advanceTimersByTimeAsync(300_000);

    expect(await refusal).toMatchObject({ code: "BODY_TIMEOUT" });
    expect((await refusal).message).toBe("The request body took longer than 300000 ms to arrive");
    /* A chunk every 20 s never waited out the 30 s between chunks. */
    expect(sent).toBeGreaterThanOrEqual(14);
  });

  it("stops as soon as the client goes away", async () => {
    const leaving = new AbortController();
    const stream = requestBodyStream(requestOf(stalled(), {}, leaving.signal), { maxBytes: 10 });
    const refusal = refusalOf(stream);

    leaving.abort();

    expect(await refusal).toMatchObject({ code: "BODY_ABORTED" });
  });

  it("tells a connection gone from a read that failed while the client was there", async () => {
    const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    const failing = (error: Error) =>
      new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(error) });

    const gone = await refusalOf(requestBodyStream(requestOf(failing(reset)), { maxBytes: 10 }));
    const broken = await refusalOf(
      requestBodyStream(requestOf(failing(new Error("bad chunk"))), { maxBytes: 10 }),
    );

    expect(gone).toMatchObject({ code: "BODY_ABORTED", cause: reset });
    expect(broken).toMatchObject({ code: "BODY_UNREADABLE", status: 400 });
  });

  it("drains the rest of the body when its reader stops early", async () => {
    const { stream, pulls } = source([bytes(1), bytes(1), bytes(1), bytes(1)]);
    const reader = requestBodyStream(requestOf(stream), { maxBytes: 10 }).getReader();

    await reader.read();
    await reader.cancel();

    await expect.poll(pulls).toBe(5);
  });

  it("holds no timer once the body has been read", async () => {
    vi.useFakeTimers();
    const request = requestOf(source([bytes(2)]).stream, { "content-length": "2" });

    await readAll(requestBodyStream(request, { maxBytes: 2 }));

    expect(vi.getTimerCount()).toBe(0);
  });
});
