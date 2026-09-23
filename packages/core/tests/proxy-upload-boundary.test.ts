/**
 * A file upload to an ungrouped endpoint, through a proxy with a boundary.
 *
 * The browser client names the group in every multipart body, as an empty
 * field when there is none. Read as a group called "", it matched nothing in
 * the boundary, and the upload was refused as "method not found" — while the
 * same call as JSON, or to a grouped endpoint, went through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { defineBoundary } from "../src/define/boundary";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "https://upstream.example",
  endpoints: { avatar: endpoint.post("avatar").response<unknown>() },
});

beforeEach(() => {
  const options = (api as unknown as { options: Record<string, unknown> }).options;
  const boundary = defineBoundary<typeof api>({ source: "api", expose: { avatar: "request" } });
  registerSources({ api: { ...(api as object), options: { ...options, boundary } } as never });
  vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

function upload(group: string | undefined): Request {
  const body = new FormData();
  body.append("file", new File(["x"], "a.png"));
  body.append("_source", "api");
  if (group !== undefined) body.append("_group", group);
  body.append("_method", "avatar");
  body.append("_options", "{}");
  return new Request("http://app.local/api/request", { method: "POST", body });
}

describe("an upload to an ungrouped endpoint behind a boundary", () => {
  it("goes through when the body names an empty group", async () => {
    expect((await createHandler().handlePost(upload(""))).status).toBe(200);
  });

  it("goes through when the body names no group", async () => {
    expect((await createHandler().handlePost(upload(undefined))).status).toBe(200);
  });
});
