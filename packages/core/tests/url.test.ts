/**
 * Resolving an endpoint's path against its source, and filling its parameters.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { retryMiddleware } from "../src/middleware/retry";
import { resolveBasePath } from "../src/utils/url";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";

describe("an endpoint path that begins with the letters http", () => {
  it("is a path, not an absolute URL", () => {
    expect(resolveBasePath("api", "httpbin/get")).toEqual({ path: "api/httpbin/get" });
  });

  it("is still an absolute URL when it has a scheme", () => {
    expect(resolveBasePath("api", "https://other.example/v2")).toEqual({
      path: "v2",
      baseUrl: "https://other.example",
    });
  });
});

const { endpoint } = courier();

let upstream: EchoServer;

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  await upstream.close();
});

describe("a FormData that fills a path parameter", () => {
  const items = defineGroup({
    prefix: "items",
    endpoints: { attach: endpoint.post(":id/files").variables<FormData>() },
  });

  function form(): FormData {
    const data = new FormData();
    data.append("id", "77");
    data.append("note", "hello");
    return data;
  }

  it("is left as the caller built it", async () => {
    const data = form();

    await createCaller(defineApi({ baseURL: upstream.origin, groups: { items } })).items.attach(
      data,
    );

    expect([...data.keys()]).toEqual(["id", "note"]);
    expect(upstream.last().url).toBe("/items/77/files");
  });

  it("can be sent a second time", async () => {
    const data = form();
    const client = createCaller(defineApi({ baseURL: upstream.origin, groups: { items } }));

    await client.items.attach(data);
    await client.items.attach(data);

    expect(upstream.received.map((request) => request.url)).toEqual([
      "/items/77/files",
      "/items/77/files",
    ]);
    expect(upstream.last().body.toString()).toContain("hello");
  });

  it("is sent again whole when the call is retried", async () => {
    const api = defineApi({
      baseURL: upstream.origin,
      middleware: [retryMiddleware({ limit: 1, backoff: 0, retryOn: () => true })],
      groups: { items },
    });

    await createCaller(api).items.attach(form());

    expect(upstream.received.map((request) => request.url)).toEqual([
      "/items/77/files",
      "/items/77/files",
    ]);
  });
});
