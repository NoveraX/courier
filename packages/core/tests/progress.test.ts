/**
 * Upload and download progress.
 *
 * `onDownloadProgress` was offered on every call and never called, and
 * `onUploadProgress` worked only for a proxy call in a browser. An upload
 * over XMLHttpRequest that was cancelled never settled, and one answered 204
 * threw.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { UploadProgress } from "../src/http-client/types";
import { xhrRequest } from "../src/utils/xhr-request";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://upstream.example",
  endpoints: {
    upload: endpoint.post("upload").response<unknown>(),
    report: endpoint.get("report").response<unknown>(),
  },
});

type Call = (variables?: unknown) => Promise<unknown>;
interface Client {
  upload: Call & { with: (options: Record<string, unknown>) => Call };
  report: Call & { with: (options: Record<string, unknown>) => Call };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload progress without XMLHttpRequest", () => {
  it("reports the body as the network takes it, ending at the whole size", async () => {
    let received = 0;
    let contentType = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      contentType = new Headers(init.headers).get("content-type") ?? "";
      received = (await new Response(init.body).arrayBuffer()).byteLength;
      return Response.json({ ok: true });
    });
    const form = new FormData();
    form.append("file", new File(["x".repeat(200_000)], "big.bin"));
    const progress: UploadProgress[] = [];

    await (createCaller(api) as unknown as Client).upload.with({
      onUploadProgress: (p: UploadProgress) => progress.push(p),
    })(form);

    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toEqual({ percent: 1, transferredBytes: received, totalBytes: received });
  });
});

describe("download progress", () => {
  it("reports the answer's body as it is read", async () => {
    const body = JSON.stringify({ rows: "y".repeat(10_000) });
    vi.stubGlobal("fetch", async () => new Response(body, { headers: { "content-length": String(body.length) } }));
    const seen: number[] = [];

    await (createCaller(api) as unknown as Client).report.with({
      onDownloadProgress: (p: UploadProgress) => seen.push(p.transferredBytes),
    })();

    expect(seen.at(-1)).toBe(body.length);
  });
});

/** Just enough of XMLHttpRequest to drive the upload path. */
class FakeXhr {
  static answer = { status: 200, body: new TextEncoder().encode('{"ok":true}').buffer };
  static hold = false;
  static sent: unknown;
  status = 0;
  statusText = "";
  response: ArrayBuffer | null = null;
  responseType = "";
  withCredentials = false;
  private listeners = new Map<string, () => void>();
  upload = { addEventListener: (_type: string, fn: (e: unknown) => void) => { this.progress = fn; } };
  private progress: (e: unknown) => void = () => {};
  open() {}
  setRequestHeader() {}
  getAllResponseHeaders() { return "content-type: application/json\r\n"; }
  addEventListener(type: string, fn: () => void) { this.listeners.set(type, fn); }
  abort() { this.listeners.get("abort")?.(); }
  send(body: unknown) {
    FakeXhr.sent = body;
    this.progress({ lengthComputable: true, loaded: 5, total: 10 });
    this.progress({ lengthComputable: true, loaded: 10, total: 10 });
    if (FakeXhr.hold) return;
    this.status = FakeXhr.answer.status;
    this.response = FakeXhr.answer.body;
    queueMicrotask(() => this.listeners.get("load")?.());
  }
}

describe("upload progress over XMLHttpRequest", () => {
  const init = () => ({ method: "post", headers: new Headers(), body: "{}" });

  it("reports progress and resolves to the answer", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.hold = false;
    FakeXhr.answer = { status: 200, body: new TextEncoder().encode('{"ok":true}').buffer };
    const percents: number[] = [];

    const response = await xhrRequest("/u", init(), (p) => percents.push(p.percent));

    expect(percents).toEqual([0.5, 1]);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("settles when cancelled through its signal", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.hold = true;
    const controller = new AbortController();

    const pending = xhrRequest("/u", { ...init(), signal: controller.signal }, () => undefined);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("sends a stream's bytes, which XMLHttpRequest cannot take as a stream", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.hold = false;
    FakeXhr.answer = { status: 200, body: new TextEncoder().encode('{"ok":true}').buffer };
    const body = new Blob(["streamed bytes"]).stream();

    await xhrRequest("/u", { ...init(), body }, () => undefined);

    expect(FakeXhr.sent).toBeInstanceOf(Blob);
    expect(await (FakeXhr.sent as Blob).text()).toBe("streamed bytes");
  });

  it("answers a 204 with no body instead of throwing", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.hold = false;
    FakeXhr.answer = { status: 204, body: new ArrayBuffer(0) };

    const response = await xhrRequest("/u", init(), () => undefined);

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});
