/**
 * Upload progress where there is no XMLHttpRequest — Node, Deno, Bun.
 *
 * The body was encoded into memory to learn its size, then reported chunk by
 * chunk as it was queued rather than as it was sent. The events ran ahead of
 * the network, kept coming after the upload was cancelled — up to 100% of a
 * body the server never received — and, sent as a one-shot stream, the body
 * could not follow a 307 that an upload without progress followed.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { UploadProgress } from "../src/http-client/types";
import { countedStream } from "../src/utils/counted-stream";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

function uploadApi(baseURL: string) {
  return defineApi({
    name: "files",
    baseURL,
    endpoints: {
      upload: endpoint.post("upload").variables<FormData>(),
      start: endpoint.post("start").variables<FormData>(),
    },
  });
}

function formWith(bytes: number): FormData {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes).fill(7)], "big.bin"));
  return form;
}

describe("a cancelled upload", () => {
  it("reports nothing after the cancel, and never the whole body", async () => {
    upstream = await startUpstream((_request, res) => res.end("{}"));
    const controller = new AbortController();
    const events: Array<{ progress: UploadProgress; afterAbort: boolean }> = [];
    const client = createCaller(uploadApi(upstream.url));

    const outcome = await client
      .with({
        signal: controller.signal,
        onUploadProgress: (progress: UploadProgress) => {
          events.push({ progress, afterAbort: controller.signal.aborted });
          if (progress.percent >= 0.3) controller.abort();
        },
      })
      .upload(formWith(8 * 1024 * 1024))
      .catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect((outcome as Error).name).toBe("AbortError");
    expect(events.filter((event) => event.afterAbort)).toEqual([]);
    const last = events.at(-1)?.progress;
    expect(last?.transferredBytes).toBeLessThan(last?.totalBytes ?? 0);
  });
});

describe("an upload that times out", () => {
  it("reports nothing once the call has failed", async () => {
    const stalled = createServer((req) => req.once("data", () => req.pause()));
    await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
    const { port } = stalled.address() as AddressInfo;
    let failed = false;
    const events: Array<{ progress: UploadProgress; afterFailure: boolean }> = [];
    const client = createCaller(uploadApi(`http://127.0.0.1:${port}`));

    try {
      await client
        .with({
          timeout: 300,
          onUploadProgress: (progress: UploadProgress) =>
            events.push({ progress, afterFailure: failed }),
        })
        .upload(formWith(32 * 1024 * 1024))
        .catch(() => {
          failed = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      stalled.closeAllConnections();
      stalled.close();
    }

    expect(failed).toBe(true);
    expect(events.filter((event) => event.afterFailure)).toEqual([]);
    const last = events.at(-1)?.progress;
    expect(last?.transferredBytes).toBeLessThan(last?.totalBytes ?? 0);
  });
});

describe("an upload that follows a redirect", () => {
  it("sends the body to the new location, as it does without progress", async () => {
    upstream = await startUpstream((request, res) => {
      if (request.url === "/start") {
        res.writeHead(307, { location: "/upload" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: request.url, bytes: request.body.byteLength }));
    });
    const client = createCaller(uploadApi(upstream.url));
    const events: UploadProgress[] = [];

    const answer = await client
      .with({ onUploadProgress: (progress: UploadProgress) => events.push(progress) })
      .start(formWith(200_000));

    expect(answer).toEqual({ url: "/upload", bytes: upstream.received[0]?.body.byteLength });
    expect(upstream.received[1]?.body.equals(upstream.received[0]?.body ?? Buffer.alloc(0))).toBe(
      true,
    );
    expect(events.at(-1)?.percent).toBe(1);
  });
});

describe("the multipart body", () => {
  it("parses into the entries it was built from", async () => {
    upstream = await startUpstream((_request, res) => res.end("{}"));
    const form = new FormData();
    form.append('na"me\nx', "line one\nline two");
    form.append("file", new File(["hello"], 'we"ird.txt', { type: "text/plain" }));

    await createCaller(uploadApi(upstream.url))
      .with({ onUploadProgress: () => undefined })
      .upload(form);
    const request = upstream.received[0];
    const parsed = await new Response(new Uint8Array(request?.body ?? []), {
      headers: { "content-type": String(request?.headers["content-type"]) },
    }).formData();

    expect(request?.headers["content-length"]).toBe(String(request?.body.byteLength));
    expect(parsed.get('na"me\r\nx')).toBe("line one\r\nline two");
    const file = parsed.get("file") as File;
    expect(file.name).toBe('we"ird.txt');
    expect(await file.text()).toBe("hello");
  });
});

describe("countedStream", () => {
  it("reports a chunk only once the next one is asked for", async () => {
    const source = new Blob([new Uint8Array(100 * 1024)]).stream();
    const events: number[] = [];
    const reader = countedStream(source, 100 * 1024, (p) => events.push(p.transferredBytes))
      .getReader();

    await reader.read();
    const afterFirst = [...events];
    await reader.read();
    const afterSecond = [...events];
    await reader.read();

    expect(afterFirst).toEqual([]);
    expect(afterSecond).toEqual([64 * 1024]);
    expect(events).toEqual([64 * 1024, 100 * 1024]);
  });

  it("ends a body of unknown size at 100% of what was sent", async () => {
    const source = new Blob([new Uint8Array(1000)]).stream();
    const events: UploadProgress[] = [];

    await new Response(countedStream(source, 0, (p) => events.push(p))).arrayBuffer();

    expect(events.at(-1)).toEqual({ percent: 1, transferredBytes: 1000, totalBytes: 1000 });
  });
});
