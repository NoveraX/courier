/**
 * The JSON body of a proxy POST: `{ variables, options }`. The endpoint is
 * named in the URL, never in the body.
 */
import { describe, expect, it } from "vitest";

import { parseJsonEnvelope } from "../src/adapter/parse-envelope";

describe("parseJsonEnvelope", () => {
  it("reads the variables and the options", () => {
    const parsed = parseJsonEnvelope('{"variables":{"id":1},"options":{"rawData":true}}');

    expect(parsed).toEqual({
      ok: true,
      envelope: { variables: { id: 1 }, options: { rawData: true } },
    });
  });

  it("reads an empty object as a call without variables or options", () => {
    expect(parseJsonEnvelope("{}")).toEqual({
      ok: true,
      envelope: { variables: undefined, options: undefined },
    });
  });

  it("refuses a body that names its endpoint", () => {
    const parsed = parseJsonEnvelope('{"source":"api","method":"list"}');

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toContain("method, source");
  });

  it("refuses options a proxy client may not set", () => {
    const parsed = parseJsonEnvelope('{"options":{"prefixUrl":"http://x"}}');

    expect(parsed.ok).toBe(false);
  });
});
