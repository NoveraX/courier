/**
 * A call that fails validation, through the proxy as directly.
 *
 * The proxy answers 422 with the issues, and the proxy client rejects with
 * the ValidationError a direct call rejects with, not a plain HTTPError, so
 * `isValidationError` and code that reads `issues` work in both modes. An
 * upstream's own 422 stays an HTTPError carrying its body.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { isValidationError } from "../src/validation";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;
let proxy: ProxyServer;

function api() {
  return defineApi({
    name: "shop",
    baseURL: upstream.url,
    endpoints: {
      order: endpoint.post("orders").variables(z.object({ qty: z.number().min(1) })),
    },
  });
}

beforeEach(async () => {
  upstream = await startUpstream((_request, res) => {
    res.writeHead(422, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: { qty: ["is too large"] } }));
  });
  registerSources({ shop: api() });
  proxy = await startProxyServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await proxy.close();
  await upstream.close();
});

async function failureOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("variables the schema refuses", () => {
  it("reject a proxy call with the ValidationError a direct call rejects with", async () => {
    const proxied = createProxyCaller<ReturnType<typeof api>>("shop", {
      proxyPath: { http: proxy.url },
    });
    const direct = createCaller(api());

    const throughProxy = await failureOf(proxied.order({ qty: 0 }));
    const directly = await failureOf(direct.order({ qty: 0 }));

    if (!isValidationError(throughProxy) || !isValidationError(directly)) {
      throw new Error("Both calls should reject with a ValidationError");
    }
    expect(throughProxy.target).toBe("variables");
    expect(throughProxy.issues).toEqual([expect.objectContaining({ path: ["qty"] })]);
    expect({ target: throughProxy.target, issues: throughProxy.issues }).toEqual({
      target: directly.target,
      issues: directly.issues,
    });
  });
});

describe("an upstream that answers 422 itself", () => {
  it("rejects with the HTTPError that carries its own body", async () => {
    const proxied = createProxyCaller<ReturnType<typeof api>>("shop", {
      proxyPath: { http: proxy.url },
    });

    const failure = await failureOf(proxied.order({ qty: 2 }));

    expect(failure).toBeInstanceOf(HTTPError);
    expect(isValidationError(failure)).toBe(false);
    expect(failure).toMatchObject({ status: 422, data: { errors: { qty: ["is too large"] } } });
  });
});
