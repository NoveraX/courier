/**
 * A multipart body read part by part as its chunks arrive, wherever the
 * chunks happen to be cut.
 */
import { describe, expect, it } from "vitest";

import { BodyError } from "../../src/adapter/body-error";
import { type MultipartPart, multipartParts } from "../../src/adapter/multipart/multipart-parts";
import {
  bytes,
  bytewise,
  chunked,
  concat,
  type ReadPart,
  ROOMY,
  readParts,
} from "../helpers/multipart-fixtures";

const B = "----courier-test-0123456789";

const field = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const file = (name: string, filename: string, type: string, data: string | Uint8Array) =>
  concat(
    `--${B}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    data,
    "\r\n",
  );
const close = `--${B}--\r\n`;

const text = (part: ReadPart): string => new TextDecoder().decode(part.bytes);

async function refusalOf(promise: Promise<unknown>): Promise<BodyError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BodyError)) throw new Error(`Expected a BodyError, got ${String(error)}`);
  return error;
}

describe("multipartParts", () => {
  const body = concat(
    field("_options", '{"timeout":5000}'),
    field("note", "line one\r\nline two"),
    file("doc", "a b.bin", "application/octet-stream", new Uint8Array([0, 13, 10, 45, 45, 255])),
    field("empty", ""),
    close,
  );

  it("reads each field and file, in order", async () => {
    const parts = await readParts(chunked(body, []).stream, B);

    expect(parts.map((part) => [part.name, part.filename, part.type])).toEqual([
      ["_options", undefined, undefined],
      ["note", undefined, undefined],
      ["doc", "a b.bin", "application/octet-stream"],
      ["empty", undefined, undefined],
    ]);
    expect(text(parts[1] as ReadPart)).toBe("line one\r\nline two");
    expect([...(parts[2] as ReadPart).bytes]).toEqual([0, 13, 10, 45, 45, 255]);
    expect((parts[3] as ReadPart).bytes).toHaveLength(0);
  });

  it("reads the same parts however the body is cut, a cut at every byte included", async () => {
    const whole = await readParts(chunked(body, []).stream, B);

    for (let cut = 1; cut < body.length; cut++) {
      expect(await readParts(chunked(body, [cut]).stream, B)).toEqual(whole);
    }
    expect(await readParts(bytewise(body), B)).toEqual(whole);
  });

  it("takes data that only looks like a delimiter for data", async () => {
    const lookalike = `--${B} \r\n--${B.slice(0, -1)}X\r--${B}\n--${B}\r\n-${B}`;
    const parts = await readParts(
      chunked(concat(file("f", "x", "text/plain", lookalike), close), []).stream,
      B,
    );

    expect(text(parts[0] as ReadPart)).toBe(lookalike);
  });

  it("passes over a preamble and an epilogue, and takes padding after a boundary", async () => {
    const padded = concat(
      "a preamble\r\n",
      `--${B} \t\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n`,
      `--${B}--\r\nan epilogue`,
    );

    const parts = await readParts(chunked(padded, []).stream, B);

    expect(parts.map((part) => [part.name, text(part)])).toEqual([["a", "1"]]);
  });

  it("refuses a body that ends before its closing boundary", async () => {
    const cut = concat(
      field("a", "1"),
      `--${B}\r\nContent-Disposition: form-data; name="b"\r\n\r\nhalf`,
    );

    const error = await refusalOf(readParts(chunked(cut, [7]).stream, B));

    expect(error).toMatchObject({ code: "BODY_MALFORMED", status: 400 });
    expect(error.message).toContain("ends before its closing boundary");
  });

  it.each([
    ["text after a boundary", `--${B}-x\r\n`],
    ["a boundary line ended with a bare line feed", `--${B}\n`],
    ["no boundary at all", "just text"],
  ])("refuses %s", async (_case, start) => {
    const error = await refusalOf(readParts(chunked(bytes(start + close), []).stream, B));

    expect(error.code).toBe("BODY_MALFORMED");
  });

  it("stops at the part past its limit, reading no more of the body", async () => {
    const many = concat(...Array.from({ length: 50 }, (_, at) => field(`f${at}`, "x")), close);
    const { stream, pulls } = chunked(
      many,
      Array.from({ length: 50 }, (_, at) => at * 60),
    );

    const error = await refusalOf(readParts(stream, B, { maxParts: 3, maxHeaderBytes: 8192 }));

    expect(error).toMatchObject({ code: "UPLOAD_TOO_MANY_PARTS", status: 413 });
    expect(pulls()).toBeLessThan(10);
  });

  it("refuses a part whose headers run past their limit", async () => {
    const long = `--${B}\r\nContent-Disposition: form-data; name="a"\r\nX-Pad: ${"p".repeat(200)}\r\n\r\n1\r\n${close}`;

    const error = await refusalOf(
      readParts(chunked(bytes(long), []).stream, B, { maxParts: 10, maxHeaderBytes: 64 }),
    );

    expect(error).toMatchObject({ code: "UPLOAD_PART_HEADERS_TOO_LARGE", status: 413 });
  });

  it("passes over a part its reader left unread", async () => {
    const seen: string[] = [];
    for await (const part of multipartParts(chunked(body, [40, 90]).stream, B, ROOMY)) {
      seen.push(part.name);
    }

    expect(seen).toEqual(["_options", "note", "doc", "empty"]);
  });

  it("refuses a part's body read once the next part was asked for", async () => {
    const parts = multipartParts(chunked(body, []).stream, B, ROOMY);
    const first = (await parts.next()).value as MultipartPart;
    await parts.next();

    await expect(first.body.getReader().read()).rejects.toThrow("after the next part");
    await parts.return?.();
  });

  it("lets go of the body when its reader stops early", async () => {
    let cancelled = false;
    const { stream } = chunked(body, [10, 20, 30, 40, 50, 60, 70, 80]);
    const reader = stream.getReader();
    const watched = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull: async (controller) => {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel: () => {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    for await (const _part of multipartParts(watched, B, ROOMY)) break;

    expect(cancelled).toBe(true);
  });

  it("fails with the body's own refusal when the body fails", async () => {
    const failing = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(bytes(field("a", "1")));
        controller.error(new BodyError("BODY_INCOMPLETE", "cut short"));
      },
    });

    expect((await refusalOf(readParts(failing, B))).code).toBe("BODY_INCOMPLETE");
  });
});
