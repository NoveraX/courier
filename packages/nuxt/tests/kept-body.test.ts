import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import { keptBodyOf } from "../src/kept-body";

/** A Node request whose body is still on the stream. */
function streaming(body: string): IncomingMessage {
  return Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
}

async function text(body: BodyInit | null | undefined): Promise<string> {
  return new Response(body).text();
}

describe("keptBodyOf", () => {
  it("leaves a body that is still on the stream to the stream", async () => {
    expect(await keptBodyOf(streaming('{"a":1}'))).toBeUndefined();
  });

  it("takes the bytes h3's readRawBody left behind", async () => {
    const req = Object.assign(streaming(""), {
      [Symbol.for("h3RawBody")]: Promise.resolve(Buffer.from('{"a":1}')),
    });

    expect(await text(await keptBodyOf(req))).toBe('{"a":1}');
  });

  it("takes the text Nitro hung on an in-process request", async () => {
    const req = Object.assign(streaming(""), { body: '{"a":2}', __unenv__: {} });

    expect(await text(await keptBodyOf(req))).toBe('{"a":2}');
  });

  it("serializes a body a middleware already parsed into an object", async () => {
    const req = Object.assign(streaming(""), { body: { a: 3 } });

    expect(await text(await keptBodyOf(req))).toBe('{"a":3}');
  });

  it("prefers raw bytes a host kept over a parsed copy", async () => {
    const req = Object.assign(streaming(""), {
      rawBody: Buffer.from('{ "a": 4 }'),
      body: { a: 4 },
    });

    expect(await text(await keptBodyOf(req))).toBe('{ "a": 4 }');
  });

  it("gives an empty body for an in-process request built without one", async () => {
    const req = Object.assign(streaming(""), { body: null, __unenv__: {} });

    expect(await keptBodyOf(req)).toBeNull();
  });

  it("keeps nothing it cannot send as a body", async () => {
    const req = Object.assign(streaming(""), { body: new Map([["a", 1]]) });

    expect(await keptBodyOf(req)).toBeUndefined();
  });
});
