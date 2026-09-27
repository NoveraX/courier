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
  return defineApi({ name: "api", baseURL: upstream.origin, groups: { documents } });
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
