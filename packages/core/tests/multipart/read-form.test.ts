/**
 * An upload read into the call's options and the caller's form, its files
 * kept in memory as one copy each.
 */
import { describe, expect, it } from "vitest";

import { BodyError } from "../../src/adapter/body-error";
import { memoryStore } from "../../src/adapter/multipart/memory-store";
import { readForm, readMultipartForm } from "../../src/adapter/multipart/read-form";
import { encodedByPlatform } from "../helpers/multipart-corpus";
import { bytewise, chunked, concat } from "../helpers/multipart-fixtures";

const LIMITS = { maxParts: 100, maxHeaderBytes: 8192, maxFieldBytes: 1024 };

async function encoded(
  entries: Array<[string, string | Blob]>,
): Promise<{ body: Uint8Array<ArrayBuffer>; boundary: string }> {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  const { body, contentType } = await encodedByPlatform(form);
  return { body, boundary: contentType.split("boundary=")[1] ?? "" };
}

async function read(entries: Array<[string, string | Blob]>, limits = LIMITS) {
  const { body, boundary } = await encoded(entries);
  return readForm(chunked(body, [17, 61]).stream, boundary, limits, memoryStore(16));
}

async function refusalOf(promise: Promise<unknown>): Promise<BodyError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BodyError)) throw new Error(`Expected a BodyError, got ${String(error)}`);
  return error;
}

describe("readForm", () => {
  it("takes the first part as the options when it is _options, and the rest as the form", async () => {
    const { options, form } = await read([
      ["_options", '{"timeout":5000}'],
      ["name", "test"],
      ["_options", "the caller's own"],
    ]);

    expect(options).toBe('{"timeout":5000}');
    expect([...form.entries()]).toEqual([
      ["name", "test"],
      ["_options", "the caller's own"],
    ]);
  });

  it("reads an _options field anywhere but first as the caller's own", async () => {
    const { options, form } = await read([
      ["name", "test"],
      ["_options", '{"timeout":5000}'],
    ]);

    expect(options).toBeUndefined();
    expect(form.get("_options")).toBe('{"timeout":5000}');
  });

  it("refuses options sent as a file", async () => {
    const error = await refusalOf(read([["_options", new File(["{}"], "o.json")]]));

    expect(error).toMatchObject({ code: "BODY_MALFORMED", status: 400 });
  });

  it("keeps each file whole, named and typed as it was sent, every one of a repeated field", async () => {
    const data = new Uint8Array(300).map((_, at) => at % 251);
    const { form } = await read([
      ["files", new File([data], "a.bin", { type: "application/octet-stream" })],
      ["files", new File(["second"], "b.txt", { type: "text/plain" })],
      ["files", new File([], "empty.log", { type: "" })],
    ]);

    const files = form.getAll("files") as File[];
    expect(files.map((file) => [file.name, file.type, file.size])).toEqual([
      ["a.bin", "application/octet-stream", 300],
      ["b.txt", "text/plain", 6],
      ["empty.log", "application/octet-stream", 0],
    ]);
    expect(new Uint8Array(await (files[0] as File).arrayBuffer())).toEqual(data);
  });

  it("gathers a file that arrives a byte at a time into the same bytes", async () => {
    const { body, boundary } = await encoded([["f", new File(["x".repeat(100)], "x.txt")]]);

    const { form } = await readForm(bytewise(body), boundary, LIMITS, memoryStore(16));

    expect(await (form.get("f") as File).text()).toBe("x".repeat(100));
  });

  it("reads a field as UTF-8, a character cut between chunks and a byte order mark kept", async () => {
    const { body, boundary } = await encoded([["note", "﻿café €"]]);

    const { form } = await readForm(bytewise(body), boundary, LIMITS, memoryStore(16));

    expect(form.get("note")).toBe("﻿café €");
  });

  it("holds the text fields together to their limit, and stops reading there", async () => {
    const { body, boundary } = await encoded([
      ["a", "x".repeat(600)],
      ["b", "y".repeat(600)],
      ["c", "after the limit"],
    ]);
    const { stream, pulls } = chunked(
      body,
      Array.from({ length: 20 }, (_, at) => at * 100),
    );

    const error = await refusalOf(readForm(stream, boundary, LIMITS, memoryStore(16)));

    expect(error).toMatchObject({ code: "UPLOAD_FIELDS_TOO_LARGE", status: 413 });
    expect(error.message).toBe("An upload's text fields exceed 1024 bytes");
    expect(pulls()).toBeLessThan(18);
  });

  it("counts the options toward the text fields' limit", async () => {
    const error = await refusalOf(
      read([
        ["_options", `{"timeout":5000,"pad":"${"p".repeat(1000)}"}`],
        ["a", "x"],
      ]),
    );

    expect(error.code).toBe("UPLOAD_FIELDS_TOO_LARGE");
  });

  it("takes a file however much larger than the text limit", async () => {
    const big = new Uint8Array(64 * 1024).fill(7);
    const { form } = await read([["f", new File([concat(big)], "big.bin")]]);

    expect((form.get("f") as File).size).toBe(64 * 1024);
  });
});

describe("readMultipartForm", () => {
  const typeOf = (boundary: string): string => `multipart/form-data; boundary=${boundary}`;

  it("reads every part into the form, a first _options field among them", async () => {
    const { body, boundary } = await encoded([
      ["_options", "a field like any other"],
      ["file", new File(["bytes"], "a.bin", { type: "application/octet-stream" })],
    ]);

    const form = await readMultipartForm(chunked(body, [17]).stream, typeOf(boundary), {
      maxFieldBytes: 1024,
    });

    expect(form.get("_options")).toBe("a field like any other");
    expect(await (form.get("file") as File).text()).toBe("bytes");
  });

  it("holds the form to its parts limit and its text limit", async () => {
    const { body, boundary } = await encoded([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ]);

    const parts = await refusalOf(
      readMultipartForm(chunked(body, []).stream, typeOf(boundary), {
        maxFieldBytes: 1024,
        maxParts: 2,
      }),
    );
    const text = await refusalOf(
      readMultipartForm(chunked(body, []).stream, typeOf(boundary), { maxFieldBytes: 2 }),
    );

    expect([parts.code, text.code]).toEqual(["UPLOAD_TOO_MANY_PARTS", "UPLOAD_FIELDS_TOO_LARGE"]);
  });

  it("refuses a type that names no boundary, the body cancelled unread", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      cancel() {
        cancelled = true;
      },
    });

    const error = await refusalOf(
      readMultipartForm(body, "multipart/form-data", { maxFieldBytes: 1024 }),
    );

    expect(error.code).toBe("BODY_MALFORMED");
    expect(cancelled).toBe(true);
  });
});
