import { describe, expect, it } from "vitest";

import { frameText } from "../src/ws-adapter";

const MESSAGE = '{"type":"subscribe","topic":"chat"}';

describe("frameText", () => {
  it("passes a text frame through", () => {
    expect(frameText(MESSAGE)).toBe(MESSAGE);
  });

  it("decodes the ArrayBuffer the Node adapter delivers", () => {
    const bytes = new TextEncoder().encode(MESSAGE);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    expect(frameText(buffer)).toBe(MESSAGE);
  });

  it("decodes the Uint8Array Deno and Bun deliver", () => {
    expect(frameText(new TextEncoder().encode(MESSAGE))).toBe(MESSAGE);
  });

  it("decodes a view that does not start at the buffer's origin", () => {
    const padded = new TextEncoder().encode(`..${MESSAGE}`);
    const view = new Uint8Array(padded.buffer, 2, padded.byteLength - 2);

    expect(frameText(view)).toBe(MESSAGE);
  });

  it("reads a Blob, which only resolves asynchronously", async () => {
    await expect(frameText(new Blob([MESSAGE]))).resolves.toBe(MESSAGE);
  });

  it("decodes multi-byte characters rather than splitting them", () => {
    const text = '{"topic":"комната","emoji":"🚚"}';

    expect(frameText(new TextEncoder().encode(text))).toBe(text);
  });
});
