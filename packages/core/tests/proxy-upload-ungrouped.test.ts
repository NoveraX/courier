/**
 * A file upload to an ungrouped endpoint marked for a page, through the proxy.
 *
 * The browser client names the group in every multipart body, as an empty
 * field when there is none. That field means no group, not a group called
 * "" whose marks open nothing, so the upload goes through as the same call
 * does as JSON or to a grouped endpoint, rather than being refused as
 * "method not found".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "https://upstream.example",
  endpoints: { avatar: endpoint.post("avatar").response<unknown>().expose() },
});

beforeEach(() => {
  registerSources({ api });
  vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

function upload(group: string | undefined): Request {
  const body = new FormData();
  body.append("_options", "{}");
  body.append("file", new File(["x"], "a.png"));
  const query = group === undefined ? "_s=api&_m=avatar" : `_s=api&_g=${group}&_m=avatar`;
  return new Request(`http://app.localhost/api/request?${query}`, { method: "POST", body });
}

describe("an upload to an ungrouped endpoint marked for a page", () => {
  it("goes through when the URL names an empty group", async () => {
    expect((await createHandler().handlePost(upload(""))).status).toBe(200);
  });

  it("goes through when the URL names no group", async () => {
    expect((await createHandler().handlePost(upload(undefined))).status).toBe(200);
  });
});
