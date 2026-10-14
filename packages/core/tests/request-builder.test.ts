/**
 * The request an endpoint's own closure asks for, as the upstream receives it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";

const { endpoint } = courier();

let upstream: EchoServer;
let proxy: ProxyServer;

beforeEach(async () => {
  upstream = await startEchoServer();
  proxy = await startProxyServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await proxy.close();
  await upstream.close();
});

const documents = defineGroup({
  prefix: "documents",
  endpoints: {
    versioned: endpoint
      .via((http) =>
        http.get("", undefined, { headers: { "x-api-version": "2", "x-api-key": "k-123" } }),
      )
      .reads(),
    xml: endpoint
      .variables<{ text: string }>()
      .via((http, v) =>
        http.post("", {}, { body: v.text, headers: { "content-type": "application/xml" } }),
      ),
    peek: endpoint.via((http) => http.head("", { headers: { "x-probe": "yes" } })).reads(),
  },
});

function source() {
  return defineApi({ expose: true, name: "api", baseURL: upstream.origin, groups: { documents } });
}

describe("headers an endpoint's closure sets", () => {
  it("are sent whatever their name", async () => {
    await createCaller(source()).documents.versioned();

    expect(upstream.last().headers["x-api-version"]).toBe("2");
    expect(upstream.last().headers["x-api-key"]).toBe("k-123");
  });

  it("decide the content type of the body the closure sends", async () => {
    await createCaller(source()).documents.xml({ text: "<a/>" });

    expect(upstream.last().headers["content-type"]).toBe("application/xml");
    expect(upstream.last().body.toString()).toBe("<a/>");
  });

  it("are sent on a HEAD", async () => {
    await createCaller(source()).documents.peek();

    expect(upstream.last().method).toBe("HEAD");
    expect(upstream.last().headers["x-probe"]).toBe("yes");
  });

  it("are sent when the call comes through the proxy", async () => {
    registerSources({ api: source() });
    const api = source();

    await createProxyCaller<typeof api>("api", { proxyPath: { http: proxy.url } }).documents.xml({
      text: "<a/>",
    });

    expect(upstream.last().headers["content-type"]).toBe("application/xml");
  });
});

const uploads = defineGroup({
  prefix: "uploads",
  endpoints: {
    blob: endpoint
      .variables<{ file: Blob }>()
      .via((http, v) => http.post("raw", undefined, { body: v.file })),
    wrapped: endpoint
      .variables<{ name: string }>()
      .via((http, v) => http.post("wrapped", undefined, { json: { data: v } })),
    bytes: endpoint.variables<{ bytes: Uint8Array<ArrayBuffer> }>().via((http, v) =>
      http.put("bin", undefined, {
        body: v.bytes,
        headers: { "content-type": "application/octet-stream" },
      }),
    ),
    fromForm: endpoint
      .variables<FormData>()
      .via((http, form) => http.put("objects/raw", {}, { body: form.get("file") ?? undefined })),
  },
});

function uploadSource() {
  return defineApi({ expose: true, name: "api", baseURL: upstream.origin, groups: { uploads } });
}

describe("a body an endpoint's closure names", () => {
  it("is sent instead of the forwarded variables", async () => {
    await createCaller(uploadSource()).uploads.blob({ file: new Blob(["closure-blob"]) });

    expect(upstream.last().body.toString()).toBe("closure-blob");
  });

  it("is sent as JSON when the closure names json", async () => {
    await createCaller(uploadSource()).uploads.wrapped({ name: "a" });

    expect(JSON.parse(upstream.last().body.toString())).toEqual({ data: { name: "a" } });
  });

  it("carries raw bytes with the content type the closure gives", async () => {
    await createCaller(uploadSource()).uploads.bytes({ bytes: new Uint8Array([7, 8, 9]) });

    expect([...upstream.last().body]).toEqual([7, 8, 9]);
    expect(upstream.last().headers["content-type"]).toBe("application/octet-stream");
  });

  it("can be a file the browser uploaded through the proxy in a FormData", async () => {
    registerSources({ api: uploadSource() });
    const api = uploadSource();
    const form = new FormData();
    form.append("file", new File(["png bytes"], "a.png", { type: "image/png" }));

    await createProxyCaller<typeof api>("api", { proxyPath: { http: proxy.url } }).uploads.fromForm(
      form,
    );

    expect(upstream.last().url).toBe("/uploads/objects/raw");
    expect(upstream.last().body.toString()).toBe("png bytes");
    expect(upstream.last().headers["content-type"]).toBe("image/png");
  });
});

describe("a HEAD endpoint's variables", () => {
  const items = defineGroup({
    prefix: "items",
    endpoints: {
      one: endpoint.head(":id").variables<Record<string, unknown>>(),
      all: endpoint.head("").variables<Record<string, unknown>>(),
    },
  });

  function client() {
    return createCaller(defineApi({ expose: true, baseURL: upstream.origin, groups: { items } }));
  }

  it("fill the path and put the rest in the query string", async () => {
    await client().items.one({ id: 9, version: "v2" });

    expect(upstream.last().method).toBe("HEAD");
    expect(upstream.last().url).toBe("/items/9?version=v2");
  });

  it("are query values even when named like a fetch option", async () => {
    await client().items.all({ body: "x", prefixUrl: "http://127.0.0.1:1/elsewhere", timeout: 1 });

    expect(upstream.received).toHaveLength(1);
    expect(upstream.last().url).toBe(
      "/items?body=x&prefixUrl=http%3A%2F%2F127.0.0.1%3A1%2Felsewhere&timeout=1",
    );
  });
});

describe("a DELETE whose closure names a JSON body", () => {
  const items = defineGroup({
    prefix: "items",
    endpoints: {
      remove: endpoint
        .variables<{ id: number; message: string; sha: string }>()
        .via((http, { id, ...reason }) => http.del(":id", { id }, { json: reason })),
    },
  });

  it("sends the body and leaves the query string alone", async () => {
    const api = defineApi({ expose: true, baseURL: upstream.origin, groups: { items } });

    await createCaller(api).items.remove({ id: 7, message: "bye", sha: "abc" });

    expect(upstream.last().method).toBe("DELETE");
    expect(upstream.last().url).toBe("/items/7");
    expect(JSON.parse(upstream.last().body.toString())).toEqual({ message: "bye", sha: "abc" });
  });
});

describe("a write whose closure passes no body", () => {
  const pets = defineGroup({
    prefix: "pets",
    endpoints: {
      rename: endpoint
        .variables<{ id: number; name: string }>()
        .via((http, { name }) => http.post(":id", undefined, { searchParams: { name } })),
    },
  });

  function source() {
    return defineApi({ expose: true, name: "api", baseURL: upstream.origin, groups: { pets } });
  }

  it("sends none, its variables only in the path and the query string", async () => {
    await createCaller(source()).pets.rename({ id: 5, name: "rex" });

    expect(upstream.last().method).toBe("POST");
    expect(upstream.last().url).toBe("/pets/5?name=rex");
    expect(upstream.last().body.toString()).toBe("");
  });

  it("sends none when the call comes through the proxy", async () => {
    registerSources({ api: source() });
    const api = source();

    await createProxyCaller<typeof api>("api", { proxyPath: { http: proxy.url } }).pets.rename({
      id: 5,
      name: "rex",
    });

    expect(upstream.last().url).toBe("/pets/5?name=rex");
    expect(upstream.last().body.toString()).toBe("");
  });
});
