/**
 * The playground payloads a runtime reads from Studio's socket, checked at
 * the wire before its responder acts on them: a request's headers are the
 * text-valued fields of an object, never an array that `new Headers()` would
 * read as name and value pairs, nor values of another type.
 */
import { describe, expect, it } from "vitest";

import { sanitizeExecute } from "../src/runtime/playground-payloads";

const CALL = { rid: "r1", source: "api", group: "users", method: "list", transport: "http" };

describe("sanitizeExecute", () => {
  it("keeps the headers whose values are text", () => {
    const payload = sanitizeExecute({
      ...CALL,
      headers: { authorization: "Bearer t", retries: 3 },
    });

    expect(payload).not.toBeNull();
    expect(payload?.headers).toEqual({ authorization: "Bearer t" });
  });

  it("reads an array as no headers, not as name and value pairs", () => {
    const payload = sanitizeExecute({ ...CALL, headers: [["x-forged", "1"]] });

    expect(payload).not.toBeNull();
    expect(payload?.headers).toBeUndefined();
  });

  it("refuses a payload whose headers reach Object.prototype", () => {
    const headers: unknown = JSON.parse('{"__proto__":{"x-polluted":"1"}}');

    expect(sanitizeExecute({ ...CALL, headers })).toBeNull();
  });

  it("refuses a payload without a request id", () => {
    expect(sanitizeExecute({ ...CALL, rid: "" })).toBeNull();
  });
});
