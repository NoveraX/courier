/**
 * What Studio is told about an upload's variables.
 *
 * Events travel to Studio as JSON, and JSON has no FormData: an upload's
 * payload arrived there as `{}`, so the panel that should list the files and
 * their sizes showed nothing at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { studioHooks } from "../src/studio";
import { describeFormData } from "../src/studio/describe-form-data";

const { endpoint } = courier();
const started = vi.fn();
const parsed = vi.fn();

beforeEach(() => {
  registerSources({
    api: defineApi({
      baseURL: "https://upstream.example",
      endpoints: { upload: endpoint.post("upload") },
    }),
  });
  vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
  studioHooks.onRequestStart = started;
  studioHooks.onProxyParse = parsed;
});

afterEach(() => {
  delete studioHooks.onRequestStart;
  delete studioHooks.onProxyParse;
  started.mockReset();
  parsed.mockReset();
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

function upload(form: FormData): Request {
  form.append("_source", "api");
  form.append("_method", "upload");
  form.append("_options", "{}");
  return new Request("http://app.localhost/api/request", { method: "POST", body: form });
}

describe("an upload as Studio sees it", () => {
  it("names each file with its type and size, and each field with its text", async () => {
    const form = new FormData();
    form.append("title", "quarterly");
    form.append("report", new File([new Uint8Array(2048)], "q3.pdf", { type: "application/pdf" }));

    await createHandler().handlePost(upload(form));

    const expected = {
      title: "quarterly",
      report: { name: "q3.pdf", type: "application/pdf", size: 2048 },
    };
    expect(started.mock.calls[0]?.[0].variables).toEqual(expected);
    expect(parsed.mock.calls[0]?.[0].variables).toEqual(expected);
  });

  it("lists every value of a field that repeats", async () => {
    const form = new FormData();
    form.append("docs", new File(["a"], "a.txt", { type: "text/plain" }));
    form.append("docs", new File(["bb"], "b.txt", { type: "text/plain" }));

    await createHandler().handlePost(upload(form));

    expect(started.mock.calls[0]?.[0].variables).toEqual({
      docs: [
        { name: "a.txt", type: "text/plain", size: 1 },
        { name: "b.txt", type: "text/plain", size: 2 },
      ],
    });
  });

  it("keeps a field named like a prototype key as a field", () => {
    const form = new FormData();
    form.append("__proto__", "value");

    const described = describeFormData(form);

    expect(Object.hasOwn(described, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(described)).toBe(Object.prototype);
  });

  it("leaves out the fields it is told to", () => {
    const form = new FormData();
    form.append("_method", "upload");
    form.append("name", "a");

    expect(describeFormData(form, new Set(["_method"]))).toEqual({ name: "a" });
  });

  it("survives JSON, which is how it reaches Studio", async () => {
    const form = new FormData();
    form.append("file", new File(["x"], "x.bin"));

    await createHandler().handlePost(upload(form));

    const variables = started.mock.calls[0]?.[0].variables;
    expect(JSON.parse(JSON.stringify(variables))).toEqual(variables);
    expect(Object.keys(variables)).toEqual(["file"]);
  });
});
