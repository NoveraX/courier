/**
 * A proxy POST whose body arrived shorter than it was sent: what a framework
 * that buffers the body before the route hands on once its own limit is
 * reached. Next.js does this when its proxy (middleware) runs on the
 * request: past `proxyClientMaxBodySize`, 10 MB by default, it ends the
 * stream it gives the route and keeps the client's Content-Length.
 */
import { describe, expect, it, vi } from "vitest";

import { createPostHandler } from "../src/adapter/handle-post";
import type { StudioHooks } from "../src/studio/hooks";

const hooks = () =>
  ({
    onProxyReceive: vi.fn(),
    onProxyParse: vi.fn(),
    onProxyRespond: vi.fn(),
    onProxyOriginReject: vi.fn(),
  }) as unknown as StudioHooks;

const BOUNDARY = "----cut";
const MB = 1024 * 1024;

/* A body of `declared` bytes of which only the first `kept` arrive, the stream then ending cleanly. */
function cutRequest(contentType: string, head: string, declared: number, kept: number): Request {
  const whole = new Uint8Array(declared);
  whole.set(new TextEncoder().encode(head));
  return new Request("http://localhost/api/request?_s=api&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": contentType,
      "content-length": String(declared),
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(whole.subarray(0, kept));
        controller.close();
      },
    }),
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

const cutUpload = (declared: number, kept: number): Request =>
  cutRequest(
    `multipart/form-data; boundary=${BOUNDARY}`,
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\nContent-Type: application/zip\r\n\r\n`,
    declared,
    kept,
  );

describe("a body cut short before the proxy reads it", () => {
  it("is answered 413 BODY_INCOMPLETE, naming that the body arrived shorter than it was sent", async () => {
    const run = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const handle = createPostHandler(run, hooks(), { maxUploadBytes: 50 * MB });

    const response = await handle(cutUpload(12 * MB, 10 * MB));

    expect(run).not.toHaveBeenCalled();
    expect(response.status).toBe(413);
    const answer = (await response.json()) as { message: string; code: string };
    expect(answer.code).toBe("BODY_INCOMPLETE");
    expect(answer.message).toMatch(/cut it short/);
    expect(answer.message).toContain(`after ${10 * MB} of the ${12 * MB} bytes`);
  });

  it("names the Next.js proxy's body limit, the setting that cuts a body short", async () => {
    const handle = createPostHandler(vi.fn(), hooks(), { maxUploadBytes: 50 * MB });

    const answer = (await (await handle(cutUpload(4096, 1024))).json()) as { message: string };

    expect(answer.message).toContain("experimental.proxyClientMaxBodySize");
  });

  it("is told apart from a JSON envelope that does not parse", async () => {
    const handle = createPostHandler(vi.fn(), hooks());

    const response = await handle(cutRequest("application/json", '{"variables":', 64, 13));

    expect(response.status).toBe(413);
    expect(((await response.json()) as { code: string }).code).toBe("BODY_INCOMPLETE");
  });
});
