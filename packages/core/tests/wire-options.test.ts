import { describe, expect, it } from "vitest";

import { LIMITS } from "../src/adapter/limits";
import { parseWireOptions, parseWireOptionsJson } from "../src/adapter/wire-options";

/** The reason text a refusal carries, or "" when the input was accepted. */
function reasonOf(result: ReturnType<typeof parseWireOptions>): string {
  return result.ok ? "" : result.reason;
}

describe("parseWireOptions — what a proxy client may set", () => {
  it("accepts an absent envelope", () => {
    expect(parseWireOptions(undefined)).toEqual({ ok: true, options: undefined });
    expect(parseWireOptions(null)).toEqual({ ok: true, options: undefined });
  });

  it("accepts the four fields a proxy request is allowed to carry", () => {
    const result = parseWireOptions({
      rawData: true,
      stream: false,
      forwardVariables: true,
      timeout: 5_000,
    });

    expect(result).toEqual({
      ok: true,
      options: { rawData: true, stream: false, forwardVariables: true, timeout: 5_000 },
    });
  });

  it("reports an envelope that set nothing as absent", () => {
    expect(parseWireOptions({})).toEqual({ ok: true, options: undefined });
  });
});

/**
 * Each of these fields reached the server's own `fetch` before the boundary
 * existed. They are refused by name so a probe cannot tell itself it worked.
 */
describe("parseWireOptions — refuses what reaches the outbound request", () => {
  it("refuses prefixUrl, which chose the destination host", () => {
    const result = parseWireOptions({ prefixUrl: "http://attacker.example" });

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("prefixUrl");
  });

  it("refuses headers, which injected credentials past both allowlists", () => {
    const result = parseWireOptions({ headers: { authorization: "Bearer attacker" } });

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("headers");
  });

  it("refuses variables, which overrode the schema-validated ones", () => {
    const result = parseWireOptions({ variables: { id: "../../../admin" } });

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("variables");
  });

  it("refuses body, json and searchParams, which shaped the upstream request", () => {
    for (const field of ["body", "json", "searchParams"]) {
      const result = parseWireOptions({ [field]: { role: "admin" } });

      expect(result.ok, field).toBe(false);
      expect(reasonOf(result)).toContain(field);
    }
  });

  it("refuses cache and next, which steered the server's own caching", () => {
    for (const field of ["cache", "next"]) {
      const result = parseWireOptions({ [field]: "no-store" });

      expect(result.ok, field).toBe(false);
      expect(reasonOf(result)).toContain(field);
    }
  });

  it("refuses signal, which broke every request when it was not a real one", () => {
    const result = parseWireOptions({ signal: {} });

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("signal");
  });

  it("names every rejected field, not just the first", () => {
    const result = parseWireOptions({ prefixUrl: "x", headers: {}, rawData: true });

    expect(reasonOf(result)).toContain("headers");
    expect(reasonOf(result)).toContain("prefixUrl");
  });

  it("refuses an unknown field rather than passing it through", () => {
    const result = parseWireOptions({ referrerPolicy: "unsafe-url" });

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("referrerPolicy");
  });
});

describe("parseWireOptions — shapes", () => {
  it("refuses a non-object envelope", () => {
    for (const raw of [42, "string", true, ["a"]]) {
      expect(parseWireOptions(raw).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it("refuses a non-boolean where a boolean is expected", () => {
    const result = parseWireOptions({ rawData: "yes" });

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("rawData");
  });

  it("refuses a timeout that is not a positive finite number", () => {
    for (const timeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "500"]) {
      expect(parseWireOptions({ timeout }).ok, String(timeout)).toBe(false);
    }
  });

  it("caps a timeout at the proxy limit rather than letting a client hold a connection", () => {
    const result = parseWireOptions({ timeout: LIMITS.MAX_PROXY_TIMEOUT_MS * 10 });

    expect(result).toEqual({ ok: true, options: { timeout: LIMITS.MAX_PROXY_TIMEOUT_MS } });
  });
});

describe("parseWireOptionsJson", () => {
  it("accepts an absent parameter", () => {
    expect(parseWireOptionsJson(null)).toEqual({ ok: true, options: undefined });
    expect(parseWireOptionsJson("")).toEqual({ ok: true, options: undefined });
  });

  it("decodes and then applies the same rules", () => {
    expect(parseWireOptionsJson('{"rawData":true}')).toEqual({
      ok: true,
      options: { rawData: true },
    });
    expect(parseWireOptionsJson('{"prefixUrl":"http://attacker.example"}').ok).toBe(false);
  });

  it("refuses malformed JSON instead of treating it as no options", () => {
    const result = parseWireOptionsJson("not-json");

    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("JSON");
  });

  it("does not let a crafted document reach Object.prototype", () => {
    const before = ({} as Record<string, unknown>).polluted;
    parseWireOptionsJson('{"__proto__":{"polluted":"yes"},"rawData":true}');

    expect(({} as Record<string, unknown>).polluted).toBe(before);
  });

  it("refuses a prototype key that survives as an own property", () => {
    const result = parseWireOptionsJson('{"constructor":{"x":1}}');

    expect(result).toEqual({ ok: true, options: undefined });
  });
});
