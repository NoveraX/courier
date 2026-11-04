/**
 * A request body read as UTF-8 text, a chunk at a time, for the JSON
 * readers: the proxy's envelope, a webhook's delivery, an MCP message.
 */
import { describe, expect, it } from "vitest";

import { readBodyText } from "../src/adapter/read-body-text";

function requestOf(chunks: Uint8Array[]): { request: Request; pulls: () => number } {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
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
  const request = new Request("http://localhost/hooks/stripe", {
    method: "POST",
    body,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
  return { request, pulls: () => pulls };
}

describe("readBodyText", () => {
  it("decodes a character split across two chunks", async () => {
    const euro = new TextEncoder().encode('{"price":"12 €"}');
    const split = euro.length - 3;
    const { request } = requestOf([euro.subarray(0, split), euro.subarray(split)]);

    expect(await readBodyText(request, { maxBytes: 100 })).toEqual({
      ok: true,
      text: '{"price":"12 €"}',
    });
  });

  it("refuses bytes that are not UTF-8 rather than replacing them, and drains the rest", async () => {
    const { request, pulls } = requestOf([new Uint8Array([0x7b, 0xff, 0x7d]), new Uint8Array(4)]);

    const read = await readBodyText(request, { maxBytes: 100 });

    expect(read.ok).toBe(false);
    expect(!read.ok && read.error).toMatchObject({
      code: "BODY_MALFORMED",
      status: 400,
      message: "The request body is not UTF-8",
    });
    await expect.poll(pulls).toBe(3);
  });

  it("answers with the reason the body itself was refused", async () => {
    const { request } = requestOf([new Uint8Array(8), new Uint8Array(8)]);

    const read = await readBodyText(request, { maxBytes: 10 });

    expect(!read.ok && read.error).toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });
});
