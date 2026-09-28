/**
 * The proxy reads a body from anyone the origin check admits, so how much
 * memory that body may cost is the server's decision, not the caller's.
 */
import { describe, expect, it, vi } from "vitest";

import { createPostHandler } from "../src/adapter/handle-post";
import { LIMITS } from "../src/adapter/limits";
import type { HandlerConfig } from "../src/adapter/handler-config";
import type { StudioHooks } from "../src/studio/hooks";

const hooks = () =>
  ({
    onProxyReceive: vi.fn(),
    onProxyParse: vi.fn(),
    onProxyRespond: vi.fn(),
    onProxyOriginReject: vi.fn(),
  }) as unknown as StudioHooks;

/** A proxy call to `api.list`, its endpoint named in the URL. */
const CALL_URL = "http://localhost/api/request?_s=api&_m=list";

const execute = () => vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

function handler(config?: HandlerConfig) {
  const run = execute();
  return { run, handle: createPostHandler(run, hooks(), config) };
}

function jsonRequest(body: string): Request {
  return new Request(CALL_URL, {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body,
  });
}

/**
 * A body the caller never sizes. `Content-Length` is absent, so only counting
 * the bytes as they arrive can stop it — this is the shape a hostile caller
 * actually sends.
 */
function chunkedRequest(chunkSize: number, chunks: number): { request: Request; sent: () => number } {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) return controller.close();
      sent += 1;
      controller.enqueue(new Uint8Array(chunkSize).fill(0x20));
    },
  });

  const request = new Request(CALL_URL, {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: stream,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });

  return { request, sent: () => sent };
}

describe("the proxy bounds what a caller may make it hold", () => {
  it("serves an ordinary envelope", async () => {
    const { run, handle } = handler();

    const response = await handle(jsonRequest(JSON.stringify({ variables: {} })));

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });

  it("refuses a declared body over the limit without reading it", async () => {
    const { run, handle } = handler({ maxBodyBytes: 1024 });

    const response = await handle(jsonRequest(JSON.stringify({ blob: "x".repeat(4096) })));

    expect(response.status).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });

  it("names the limit it refused against", async () => {
    const { handle } = handler({ maxBodyBytes: 1024 });

    const response = await handle(jsonRequest(JSON.stringify({ blob: "x".repeat(4096) })));

    expect((await response.json()).message).toBe("Request body exceeds 1024 bytes");
  });

  /** The case Content-Length alone cannot catch. */
  it("refuses an undeclared body once the bytes cross the limit", async () => {
    const { run, handle } = handler({ maxBodyBytes: 4096 });
    const { request } = chunkedRequest(1024, 100);

    const response = await handle(request);

    expect(response.status).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });

  /** A client still uploading is answered at the chunk that crossed the line. */
  it("answers without waiting for the rest of the body", async () => {
    const { handle } = handler({ maxBodyBytes: 4096 });
    let sent = 0;
    const stillUploading = new ReadableStream<Uint8Array>({
      async pull(controller) {
        sent += 1;
        if (sent > 10) await new Promise<void>(() => {});
        controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    const request = new Request(CALL_URL, {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: stillUploading,
      // @ts-expect-error -- required by the platform for a streaming body
      duplex: "half",
    });

    expect((await handle(request)).status).toBe(413);
  });

  /** A browser reads the refusal only once its upload has gone through. */
  it("discards the rest of the body once it has refused it", async () => {
    const { handle } = handler({ maxBodyBytes: 4096 });
    const { request, sent } = chunkedRequest(1024, 1_000);

    await handle(request);

    await expect.poll(sent).toBe(1_000);
  });
});

describe("an upload is measured against its own limit", () => {
  /**
   * The upload as a server hands it to the handler: the multipart bytes as a
   * stream, not a FormData object. Node 24.21's undici also leaves an
   * unhandled rejection when a reader cancels a body it built from a
   * FormData object, a shape no server produces.
   */
  async function uploadRequest(bytes: number): Promise<Request> {
    const form = new FormData();
    form.set("note", "upload");
    form.set("file", new Blob([new Uint8Array(bytes)]), "payload.bin");
    const encoded = new Response(form);
    const payload = new Uint8Array(await encoded.arrayBuffer());

    return new Request(CALL_URL, {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": encoded.headers.get("content-type") ?? "" },
      body: new Blob([payload]).stream(),
      // @ts-expect-error -- required by the platform for a streaming body
      duplex: "half",
    });
  }

  it("accepts an upload larger than the JSON limit", async () => {
    const { run, handle } = handler({ maxBodyBytes: 1024, maxUploadBytes: 1_000_000 });

    const response = await handle(await uploadRequest(64_000));

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });

  it("still parses the fields the envelope carries", async () => {
    const { run, handle } = handler({ maxUploadBytes: 1_000_000 });

    await handle(await uploadRequest(128));

    const [, payload] = run.mock.calls[0]!;
    const { variables } = payload as { variables: FormData };
    expect(variables).toBeInstanceOf(FormData);
    expect(variables.get("note")).toBe("upload");
    expect(variables.get("file")).toBeInstanceOf(File);
  });

  it("refuses an upload over the upload limit", async () => {
    const { handle } = handler({ maxUploadBytes: 4096 });

    expect((await handle(await uploadRequest(64_000))).status).toBe(413);
  });
});

describe("defaults", () => {
  it("are generous for an envelope and larger for an upload", () => {
    expect(LIMITS.MAX_PROXY_BODY_BYTES).toBe(1_048_576);
    expect(LIMITS.MAX_PROXY_UPLOAD_BYTES).toBe(10_485_760);
  });

  it("apply when nothing is configured", async () => {
    const { handle } = handler();
    const { request } = chunkedRequest(65_536, 100);

    expect((await handle(request)).status).toBe(413);
  });
});

describe("a body the proxy cannot read at all", () => {
  it("refuses an unsupported content type before reading", async () => {
    const { run, handle } = handler();
    const request = new Request(CALL_URL, {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "text/plain" },
      body: "hello",
    });

    expect((await handle(request)).status).toBe(415);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses malformed JSON that fits the limit", async () => {
    const { handle } = handler();

    expect((await handle(jsonRequest("{ not json"))).status).toBe(400);
  });
});
