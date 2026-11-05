/**
 * A body the proxy refuses is answered with the status its refusal names
 * and its code — 413, 415, 408, 400 — whichever way the refusal reaches
 * the answer, now that it is one of Courier's own errors. Before the call
 * runs, the envelope's reading refuses it. As an upload is sent on, a fetch
 * fails with it: undici's wrapped in its own failure, or — as a runtime
 * whose fetch passes a body's error on does — the refusal itself, which the
 * transport passes on as it passes on every Courier error, unwrapped. That
 * is never taken for a cancellation, a missing token or the server's own
 * failure; a client that leaves is still a client that left.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter/create-handler";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { courier, defineApi, defineGroup } from "../src/define/index";
import type { PlatformFetch } from "../src/http-client/source-transport";
import { studioHooks } from "../src/studio";
import { chunked, concat } from "./helpers/multipart-fixtures";

const { endpoint } = courier();
const B = "----courier-client";
const started = vi.fn();
const failed = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  studioHooks.onRequestStart = started;
  studioHooks.onRequestError = failed;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete studioHooks.onRequestStart;
  delete studioHooks.onRequestError;
  started.mockReset();
  failed.mockReset();
});

const fieldPart = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const fileHead = `--${B}\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\nContent-Type: application/zip\r\n\r\n`;
const upload = concat(fieldPart("note", "hi"), fileHead, "z".repeat(40_000), `\r\n--${B}--\r\n`);

/**
 * A source's fetch that reads the upload to its end and fails with what the
 * read failed with, as it is, keeping each failure and counting its calls.
 * `leaves` runs once the first piece has been read, as a client that leaves
 * partway does.
 */
function passingTheBodysErrorOn(leaves?: () => void) {
  const failures: unknown[] = [];
  let calls = 0;
  const fetch: PlatformFetch = async (_url, init) => {
    calls += 1;
    if (!(init.body instanceof ReadableStream)) return Response.json({ ok: true });
    const reader = init.body.getReader();
    try {
      await reader.read();
      leaves?.();
      while (!(await reader.read()).done) {}
    } catch (error) {
      failures.push(error);
      throw error;
    }
    return Response.json({ ok: true });
  };
  return { fetch, failures, calls: () => calls };
}

function handler(config: HandlerConfig, fetch?: PlatformFetch) {
  const api = defineApi({
    baseURL: "http://upstream.invalid",
    ...(fetch && { fetch }),
    groups: {
      files: defineGroup({
        prefix: "files",
        expose: true,
        endpoints: { upload: endpoint.post("upload") },
      }),
    },
  });
  return createHandler({ sources: { api }, ...config }).handlePost;
}

interface Sent {
  body: ReadableStream<Uint8Array<ArrayBuffer>>;
  type?: string;
  declared?: number;
  encoding?: string;
  signal?: AbortSignal;
}

function request({
  body,
  type = `multipart/form-data; boundary=${B}`,
  declared,
  encoding,
  signal,
}: Sent) {
  return new Request("http://localhost/api/request?_s=api&_g=files&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": type,
      ...(declared !== undefined && { "content-length": String(declared) }),
      ...(encoding && { "content-encoding": encoding }),
    },
    body,
    signal,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

/* A body that sends `sent` and then nothing more, never ending. */
function stalling(sent: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  let pulls = 0;
  return new ReadableStream({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) return controller.enqueue(sent);
      return new Promise<void>(() => {});
    },
  });
}

const codeOf = async (response: Response): Promise<string> =>
  ((await response.json()) as { code: string }).code;

describe("a body refused before the call runs", () => {
  it.each([
    [
      "a JSON envelope over maxBodyBytes",
      { maxBodyBytes: 16 },
      {
        body: chunked(concat('{"variables":{"note":"far too long"}}'), []).stream,
        type: "application/json",
      },
      413,
      "BODY_TOO_LARGE",
    ],
    [
      "a compressed upload",
      {},
      { body: chunked(upload, []).stream, encoding: "gzip" },
      415,
      "BODY_ENCODING_UNSUPPORTED",
    ],
    [
      "an upload that stops arriving",
      { bodyIdleTimeoutMs: 20 },
      { body: stalling(concat(fieldPart("note", "hi"))) },
      408,
      "BODY_TIMEOUT",
    ],
    [
      "an upload cut short of its length",
      {},
      { body: chunked(upload.slice(0, 1000), []).stream, declared: upload.length },
      413,
      "BODY_INCOMPLETE",
    ],
  ] as const)("is answered as before: %s", async (_case, config, sent, status, code) => {
    const source = passingTheBodysErrorOn();

    const response = await handler(config, source.fetch)(request(sent));

    expect(response.status).toBe(status);
    expect(await codeOf(response)).toBe(code);
    expect(source.calls()).toBe(0);
  });
});

describe("an upload sent on as it arrives, whose fetch fails with the body's own refusal", () => {
  it.each([
    [
      "cut short of its length",
      { body: chunked(upload.slice(0, 20_000), [5000]).stream, declared: upload.length },
      {},
      413,
      "BODY_INCOMPLETE",
    ],
    [
      "stopped arriving",
      { body: stalling(concat(fieldPart("note", "hi"), fileHead, "z".repeat(5000))) },
      { bodyIdleTimeoutMs: 20 },
      408,
      "BODY_TIMEOUT",
    ],
    [
      "broken in a later part",
      {
        body: chunked(
          concat(
            fieldPart("note", "hi"),
            fileHead,
            "z".repeat(5000),
            `\r\n--${B}\r\nbroken\r\n\r\nx`,
          ),
          [3000],
        ).stream,
      },
      {},
      400,
      "BODY_MALFORMED",
    ],
  ] as const)("is answered with the refusal when %s", async (_case, sent, config, status, code) => {
    const source = passingTheBodysErrorOn();

    const response = await handler(
      { uploadMode: "stream", ...config },
      source.fetch,
    )(request(sent));

    expect(source.failures).toEqual([expect.objectContaining({ name: "BodyError", code })]);
    expect(response.status).toBe(status);
    expect(await codeOf(response)).toBe(code);
    expect(failed.mock.calls.at(-1)?.[0]).toMatchObject({ error: { type: "http", status } });
  });

  it("answers a client that leaves partway as one that left", async () => {
    const leaving = new AbortController();
    const source = passingTheBodysErrorOn(() => leaving.abort());

    const response = await handler(
      { uploadMode: "stream" },
      source.fetch,
    )(
      request({
        body: stalling(concat(fieldPart("note", "hi"), fileHead, "z".repeat(5000))),
        signal: leaving.signal,
      }),
    );

    expect(source.failures).toEqual([
      expect.objectContaining({ name: "BodyError", code: "BODY_ABORTED" }),
    ]);
    expect(response.status).toBe(499);
    expect(failed.mock.calls.at(-1)?.[0]).toMatchObject({ error: { type: "aborted" } });
  });
});
