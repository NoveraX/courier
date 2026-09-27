/**
 * Building a request body from the caller's variables.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { filterEmptyFiles } from "../src/http-client/body-builder";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";

describe("a multipart field holding several files", () => {
  it("keeps the real files when one of them is empty", () => {
    const form = new FormData();
    form.append("files", new File(["a"], "a.txt"));
    form.append("files", new File([], ""));
    form.append("files", new File(["c"], "c.txt"));
    form.append("note", "hi");

    filterEmptyFiles(form);

    expect(form.getAll("files").map((file) => (file as File).name)).toEqual(["a.txt", "c.txt"]);
    expect(form.get("note")).toBe("hi");
  });
});

const { endpoint } = courier();
const items = defineGroup({
  prefix: "items",
  endpoints: {
    create: endpoint.post("").variables<unknown>(),
    list: endpoint.get("").variables<unknown>(),
  },
});

let upstream: EchoServer;

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

function caller(options: { defaultBody?: Record<string, unknown> } = {}) {
  return createCaller(defineApi({ name: "api", baseURL: upstream.origin, ...options, groups: { items } }));
}

describe("variables that are a JSON value other than an object", () => {
  it("sends a JSON array body as an array", async () => {
    await caller().items.create([1, 2, 3]);

    expect(upstream.last().body.toString()).toBe("[1,2,3]");
    expect(upstream.last().headers["content-type"]).toBe("application/json");
  });

  it("sends an array of objects as an array", async () => {
    await caller().items.create([{ id: 1 }, { id: 2 }]);

    expect(JSON.parse(upstream.last().body.toString())).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("leaves defaultBody out of an array body", async () => {
    await caller({ defaultBody: { locale: "en" } }).items.create([1]);

    expect(upstream.last().body.toString()).toBe("[1]");
  });

  it("sends an empty array rather than no body", async () => {
    await caller().items.create([]);

    expect(upstream.last().body.toString()).toBe("[]");
  });

  it("sends a string, a number and false as JSON", async () => {
    await caller().items.create("text");
    await caller().items.create(42);
    await caller().items.create(false);

    expect(upstream.received.map((request) => request.body.toString())).toEqual([
      '"text"',
      "42",
      "false",
    ]);
  });

  it("sends an array that arrived through the proxy as an array", async () => {
    registerSources({ api: defineApi({ name: "api", baseURL: upstream.origin, groups: { items } }) });

    const response = await createHandler().handlePost(
      new Request("http://app.local/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "api",
          group: "items",
          method: "create",
          variables: [{ id: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(upstream.last().body.toString())).toEqual([{ id: 1 }]);
  });
});

describe("variables that already are a request body", () => {
  it("sends URLSearchParams form-encoded", async () => {
    await caller().items.create(new URLSearchParams({ a: "1", b: "x y" }));

    expect(upstream.last().body.toString()).toBe("a=1&b=x+y");
    expect(upstream.last().headers["content-type"]).toMatch(/^application\/x-www-form-urlencoded/);
  });

  it("sends a Blob's bytes with its type", async () => {
    await caller().items.create(new Blob(["blob data"], { type: "text/csv" }));

    expect(upstream.last().body.toString()).toBe("blob data");
    expect(upstream.last().headers["content-type"]).toBe("text/csv");
  });

  it("sends the bytes of an ArrayBuffer and of a Uint8Array", async () => {
    await caller().items.create(new Uint8Array([1, 2, 255]).buffer);
    await caller().items.create(new Uint8Array([4, 5, 6]));

    expect([...upstream.received[0]!.body]).toEqual([1, 2, 255]);
    expect([...upstream.received[1]!.body]).toEqual([4, 5, 6]);
  });

  it("streams a ReadableStream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed"));
        controller.close();
      },
    });

    await caller().items.create(stream);

    expect(upstream.last().body.toString()).toBe("streamed");
  });

  it("refuses a body for a GET before any request is made", async () => {
    const failure = await caller()
      .items.list(new Blob(["x"]))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(400);
    expect(upstream.received).toHaveLength(0);
  });
});
