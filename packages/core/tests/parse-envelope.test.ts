/**
 * The body of a proxy POST: `{ variables, options }` as JSON, or the
 * caller's form behind an `_options` field. The endpoint is named in the URL,
 * never in the body.
 */
import { describe, expect, it } from "vitest";

import { parseFormEnvelope, parseJsonEnvelope } from "../src/adapter/parse-envelope";

const encode = (value: string) => new TextEncoder().encode(value);

describe("parseJsonEnvelope", () => {
  it("reads the variables and the options", () => {
    const parsed = parseJsonEnvelope(encode('{"variables":{"id":1},"options":{"rawData":true}}'));

    expect(parsed).toEqual({ ok: true, envelope: { variables: { id: 1 }, options: { rawData: true } } });
  });

  it("reads an empty object as a call without variables or options", () => {
    expect(parseJsonEnvelope(encode("{}"))).toEqual({
      ok: true,
      envelope: { variables: undefined, options: undefined },
    });
  });

  it("refuses a body that names its endpoint", () => {
    const parsed = parseJsonEnvelope(encode('{"source":"api","method":"list"}'));

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toContain("method, source");
  });

  it("refuses options a proxy client may not set", () => {
    const parsed = parseJsonEnvelope(encode('{"options":{"prefixUrl":"http://x"}}'));

    expect(parsed.ok).toBe(false);
  });
});

describe("parseFormEnvelope", () => {
  it("takes the first _options field as the options and the rest as the variables", () => {
    const form = new FormData();
    form.append("_options", JSON.stringify({ timeout: 5000 }));
    form.append("name", "test");

    const parsed = parseFormEnvelope(form);

    expect(parsed.ok && parsed.envelope.options).toEqual({ timeout: 5000 });
    expect(parsed.ok && [...(parsed.envelope.variables as FormData).entries()]).toEqual([["name", "test"]]);
  });

  it("keeps a later _options field as the caller's", () => {
    const form = new FormData();
    form.append("_options", "{}");
    form.append("_options", "the caller's");

    const parsed = parseFormEnvelope(form);

    expect(parsed.ok && (parsed.envelope.variables as FormData).getAll("_options")).toEqual(["the caller's"]);
  });

  it("reads a form without an options field as a call without options", () => {
    const form = new FormData();
    form.append("name", "test");

    expect(parseFormEnvelope(form)).toMatchObject({ ok: true, envelope: { options: undefined } });
  });

  it("keeps every file of a field that repeats", () => {
    const form = new FormData();
    form.append("_options", "{}");
    for (const name of ["a.txt", "b.txt", "c.txt"]) form.append("files", new File([name], name));

    const parsed = parseFormEnvelope(form);

    expect(parsed.ok && (parsed.envelope.variables as FormData).getAll("files")).toHaveLength(3);
  });

  it("refuses options that are not JSON", () => {
    const form = new FormData();
    form.append("_options", "not-json");

    expect(parseFormEnvelope(form)).toEqual({ ok: false, reason: "options is not valid JSON" });
  });

  it("drops a key that reaches Object.prototype from the options", () => {
    const form = new FormData();
    form.append("_options", '{"__proto__":{"admin":true},"timeout":5000}');

    const parsed = parseFormEnvelope(form);

    expect(parsed.ok && parsed.envelope.options).toEqual({ timeout: 5000 });
    expect(parsed.ok && Object.getPrototypeOf(parsed.envelope.options)).toBe(Object.prototype);
  });
});
