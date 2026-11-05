/**
 * An upload sent on as it arrives: re-encoded part by part, read only as
 * fast as the upstream reads it, and failed with the body's refusal.
 */
import { describe, expect, it } from "vitest";

import { BodyError } from "../../src/adapter/body-error";
import { memoryStore } from "../../src/adapter/multipart/memory-store";
import { readForm } from "../../src/adapter/multipart/read-form";
import { streamedForm } from "../../src/adapter/multipart/streamed-form";
import { encodeMultipart } from "../../src/utils/multipart-body";
import { isStreamedUpload } from "../../src/utils/streamed-upload";
import {
  encodedByPlatform,
  latin1,
  mutated,
  randomCuts,
  randomForm,
} from "../helpers/multipart-corpus";
import { chunked, concat, seededRandom } from "../helpers/multipart-fixtures";

const LIMITS = { maxParts: 100, maxHeaderBytes: 8192, maxFieldBytes: 4096 };
const B = "----courier-streamed";

const field = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const fileHead = (name: string, filename: string, type?: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
  `${type === undefined ? "" : `Content-Type: ${type}\r\n`}\r\n`;
const close = `--${B}--\r\n`;

/** Every byte of an upload, read as the upstream reads it. */
async function sent(upload: ReadableStream<Uint8Array>): Promise<string> {
  const pieces: Uint8Array[] = [];
  for await (const piece of upload) pieces.push(piece);
  return latin1(concat(...pieces));
}

/** The body with its boundary named the same whoever chose it, so two encodings compare. */
const unbounded = (text: string, contentType: string): string =>
  text.replaceAll(contentType.split("boundary=")[1] ?? "", "BOUNDARY");

async function refusalOf(promise: Promise<unknown>): Promise<BodyError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BodyError)) throw new Error(`Expected a BodyError, got ${String(error)}`);
  return error;
}

/** What `readForm` and then `encodeMultipart` send for a body: the upload kept, then sent. */
async function keptThenSent(
  body: Uint8Array<ArrayBuffer>,
  boundary: string,
  cuts: number[],
): Promise<{ options: string | undefined; text: string } | { refused: string }> {
  try {
    const { options, form } = await readForm(
      chunked(body, cuts).stream,
      boundary,
      LIMITS,
      memoryStore(64),
    );
    const { blob, contentType } = encodeMultipart(form);
    return {
      options,
      text: unbounded(latin1(new Uint8Array(await blob.arrayBuffer())), contentType),
    };
  } catch (error) {
    if (error instanceof BodyError) return { refused: error.code };
    throw error;
  }
}

/** What `streamedForm` sends for the same body. */
async function streamedThenSent(
  body: Uint8Array<ArrayBuffer>,
  boundary: string,
  cuts: number[],
): Promise<{ options: string | undefined; text: string } | { refused: string }> {
  try {
    const { options, upload } = await streamedForm(chunked(body, cuts).stream, boundary, LIMITS);
    return { options, text: unbounded(await sent(upload), upload.type) };
  } catch (error) {
    if (error instanceof BodyError) return { refused: error.code };
    throw error;
  }
}

describe("streamedForm", () => {
  it("sends every body on as readForm and encodeMultipart would, however it is cut", async () => {
    const random = seededRandom(0x5eed_0a11);
    for (let round = 0; round < 300; round++) {
      const { body, contentType } = await encodedByPlatform(randomForm(random));
      const boundary = contentType.split("boundary=")[1] ?? "";
      const input = round % 3 === 2 ? mutated(random, body, boundary) : body;

      const kept = await keptThenSent(input, boundary, randomCuts(random, input.length));
      const streamed = await streamedThenSent(input, boundary, randomCuts(random, input.length));

      expect(streamed, `round ${round}`).toEqual(kept);
    }
  });

  it("reads the options before it returns, and sends the rest without them", async () => {
    const { options, upload } = await streamedForm(
      chunked(concat(field("_options", '{"timeout":5000}'), field("note", "hi"), close), [9])
        .stream,
      B,
      LIMITS,
    );

    expect(options).toBe('{"timeout":5000}');
    const text = await sent(upload);
    expect(text).not.toContain("_options");
    expect(text).toContain('name="note"\r\n\r\nhi\r\n');
  });

  it("refuses options sent as a file", async () => {
    const body = concat(fileHead("_options", "o.json", "application/json"), "{}\r\n", close);

    const refusal = await refusalOf(streamedForm(chunked(body, []).stream, B, LIMITS));

    expect(refusal.code).toBe("BODY_MALFORMED");
  });

  it("is a streamed upload whose type names a boundary of its own", async () => {
    const { upload } = await streamedForm(
      chunked(concat(field("a", "1"), close), []).stream,
      B,
      LIMITS,
    );

    expect(isStreamedUpload(upload)).toBe(true);
    expect(upload.type).toMatch(/^multipart\/form-data; boundary=----courier-[0-9a-f-]{36}$/);
    expect(upload.type).not.toContain(B);
  });

  it("sends an empty form as its closing delimiter alone", async () => {
    const { options, upload } = await streamedForm(chunked(concat(close), []).stream, B, LIMITS);

    expect(options).toBeUndefined();
    expect(unbounded(await sent(upload), upload.type)).toBe("--BOUNDARY--\r\n");
  });

  it("types a file as a File would: text/plain unnamed, lowercase, and octet-stream for none", async () => {
    const body = concat(
      fileHead("a", "a.txt"),
      "a\r\n",
      fileHead("b", "b.png", "IMAGE/PNG"),
      "b\r\n",
      fileHead("c", "c.bin", "bad\u0001type"),
      "c\r\n",
      close,
    );
    const { upload } = await streamedForm(chunked(body, [40]).stream, B, LIMITS);

    const types = [...(await sent(upload)).matchAll(/Content-Type: ([^\r]*)\r\n/g)].map(
      (match) => match[1],
    );

    expect(types).toEqual(["text/plain", "image/png", "application/octet-stream"]);
  });

  it("reads the client's body only as fast as the upload is read", async () => {
    const piece = "x".repeat(1000);
    const body = concat(
      field("_options", "{}"),
      fileHead("file", "f.bin"),
      piece.repeat(100),
      "\r\n",
      close,
    );
    const head = field("_options", "{}").length + fileHead("file", "f.bin").length;
    const { stream, pulls } = chunked(
      body,
      Array.from({ length: 101 }, (_, at) => head + at * 1000),
    );

    const { upload } = await streamedForm(stream, B, LIMITS);
    const reader = upload.getReader();
    const before = pulls();
    for (let read = 0; read < 10; read++) await reader.read();
    const afterTen = pulls();
    while (!(await reader.read()).done) {}

    expect(before).toBeLessThanOrEqual(2);
    expect(afterTen - before).toBeLessThanOrEqual(11);
    expect(pulls()).toBe(103);
  });

  it.each([
    [
      "it ends before its closing boundary",
      concat(field("a", "1"), fileHead("file", "f.bin"), "x".repeat(5000)),
      "BODY_MALFORMED",
      LIMITS,
    ],
    [
      "a part's headers do not parse",
      concat(field("a", "1"), `--${B}\r\nno colon here\r\n\r\nx\r\n`, close),
      "BODY_MALFORMED",
      LIMITS,
    ],
    [
      "its text passes maxFieldBytes",
      concat(field("a", "1"), field("b", "y".repeat(5000)), close),
      "UPLOAD_FIELDS_TOO_LARGE",
      LIMITS,
    ],
    [
      "it holds more parts than maxParts",
      concat(field("a", "1"), field("b", "2"), field("c", "3"), close),
      "UPLOAD_TOO_MANY_PARTS",
      { ...LIMITS, maxParts: 2 },
    ],
  ])(
    "fails the upload with the body's refusal, its close never sent, when %s",
    async (_case, body, code, limits) => {
      const { upload } = await streamedForm(chunked(body, [30, 200, 3000]).stream, B, limits);
      const reader = upload.getReader();
      const text: string[] = [];

      const refusal = await refusalOf(
        (async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            text.push(latin1(value));
          }
        })(),
      );

      expect(refusal.code).toBe(code);
      expect(text.join("")).not.toMatch(/--\r\n$/);
    },
  );

  it("fails the upload with the refusal of a body that fails partway", async () => {
    const cut = new BodyError("BODY_INCOMPLETE", "cut short");
    let pulls = 0;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1)
          return controller.enqueue(concat(field("a", "1"), fileHead("f", "f.bin"), "abc"));
        controller.error(cut);
      },
    });
    const { upload } = await streamedForm(body, B, LIMITS);

    const refusal = await refusalOf(sent(upload));

    expect(refusal).toBe(cut);
  });

  it("cancels the client's body when stopped, an upload still being read failing", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.enqueue(concat(field("a", "1"), fileHead("f", "f.bin"), "abc"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { upload, stop } = await streamedForm(body, B, LIMITS);
    const reader = upload.getReader();
    await reader.read();

    await stop();

    expect(cancelled).toBe(true);
    await expect(reader.read()).rejects.toThrow("The upload was stopped before it was sent whole");
  });

  it("stops quietly once the client's body has failed", async () => {
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.error(new BodyError("BODY_TIMEOUT", "too slow"));
      },
    });
    const refusal = await refusalOf(streamedForm(body, B, LIMITS));

    expect(refusal.code).toBe("BODY_TIMEOUT");
  });

  it("cancels the client's body when the upstream cancels the upload", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.enqueue(concat(field("a", "1"), fileHead("f", "f.bin"), "abc"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { upload } = await streamedForm(body, B, LIMITS);

    await upload.cancel(new Error("the upstream went away"));

    expect(cancelled).toBe(true);
  });
});
