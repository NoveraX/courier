/**
 * The media type of a proxy request, which RFC 9110 makes case-insensitive.
 *
 * `Application/JSON` and `Multipart/Form-Data` are read as JSON and as an
 * upload, not answered 415 as though the proxy accepted neither.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();

beforeEach(() => {
  registerSources({
    api: defineApi({
      baseURL: "https://upstream.example",
      endpoints: { save: endpoint.post("save").response<unknown>() },
    }),
  });
  vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("a proxy request's content type", () => {
  it.each(["application/json", "Application/JSON", "APPLICATION/JSON; charset=utf-8"])(
    "accepts %s",
    async (contentType) => {
      const response = await createHandler().handlePost(
        new Request("http://app.localhost/api/request?_s=api&_m=save", {
          method: "POST",
          headers: { "content-type": contentType },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(200);
    },
  );

  it("still refuses a type it does not read", async () => {
    const response = await createHandler().handlePost(
      new Request("http://app.localhost/api/request?_s=api&_m=save", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(415);
  });
});
