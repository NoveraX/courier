/**
 * Reads scoped to the render a framework serves: within one render, a
 * request sent again — the same method, address, headers and body — is
 * answered with the first one's answer however far apart the two are, each
 * call with a copy of its own. Anything sent differently goes out: other
 * variables, other credentials, a session the render renewed. A write made
 * in the render forgets every read, a failure is not kept, and a call that
 * asks to go alone does.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests } from "../src/sources";
import { type RenderMemo, registerRenderMemo } from "../src/utils/render-memo";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();

let upstream: Upstream;
let render: RenderMemo;
let unregister: () => void;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    if (request.url.startsWith("/broken")) {
      res.writeHead(502, { "content-type": "application/json" }).end('{"message":"down"}');
      return;
    }
    if (request.url.startsWith("/empty")) {
      res.writeHead(204).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "x-served": "upstream" });
    res.end(JSON.stringify({ url: request.url, seen: [] }));
  });
  render = new Map();
  unregister = registerRenderMemo(() => render);
});

afterEach(async () => {
  unregister();
  _resetSourcesForTests();
  await upstream.close();
});

function shop(headers?: Record<string, string>) {
  return createCaller(
    defineApi({
      name: "shop",
      baseURL: upstream.url,
      ...(headers && { headers }),
      endpoints: {
        seo: endpoint
          .get("seo")
          .variables<{ page: string }>()
          .response<{ url: string; seen: string[] }>(),
        broken: endpoint.get("broken"),
        empty: endpoint.get("empty"),
        rename: endpoint.post("pages").variables<{ title: string }>(),
      },
    }),
  );
}

describe("a read the render sends again", () => {
  it("is answered from the first, whenever it comes, with a copy of its own", async () => {
    const api = shop();
    const metadata = await api.seo({ page: "/" });
    metadata.seen.push("metadata");

    const body = await api.seo({ page: "/" });

    expect(upstream.received).toHaveLength(1);
    expect(body).toEqual({ url: "/seo?page=%2F", seen: [] });
  });

  it("keeps the answer's status and headers", async () => {
    const api = shop();
    await api.raw.seo({ page: "/" });

    const again = await api.raw.seo({ page: "/" });

    expect(again.status).toBe(200);
    expect(again.headers.get("x-served")).toBe("upstream");
    expect(upstream.received).toHaveLength(1);
  });

  it("keeps an answer with no body", async () => {
    const api = shop();
    await api.empty();

    await expect(api.empty()).resolves.toBeNull();
    expect(upstream.received).toHaveLength(1);
  });

  it("goes out again with other variables, or in another render", async () => {
    const api = shop();
    await api.seo({ page: "/" });
    await api.seo({ page: "/about" });
    render = new Map();
    await api.seo({ page: "/" });

    expect(upstream.received.map(({ url }) => url)).toEqual([
      "/seo?page=%2F",
      "/seo?page=%2Fabout",
      "/seo?page=%2F",
    ]);
  });

  it("goes out again when it is sent with other credentials", async () => {
    await shop({ authorization: "Bearer ada" }).seo({ page: "/" });

    await shop({ authorization: "Bearer bob" }).seo({ page: "/" });

    expect(upstream.received.map(({ headers }) => headers.authorization)).toEqual([
      "Bearer ada",
      "Bearer bob",
    ]);
  });

  it("goes out again after a write the render made", async () => {
    const api = shop();
    await api.seo({ page: "/" });
    await api.rename({ title: "New" });

    await api.seo({ page: "/" });

    expect(upstream.received.map(({ method }) => method)).toEqual(["GET", "POST", "GET"]);
  });

  it("goes out again after the first one failed", async () => {
    const api = shop();
    await expect(api.broken()).rejects.toMatchObject({ status: 502 });

    await expect(api.broken()).rejects.toMatchObject({ status: 502 });

    expect(upstream.received).toHaveLength(2);
  });

  it("goes out again when the call asks to go alone", async () => {
    const api = shop();
    await api.seo({ page: "/" });

    await api.with({ coalesce: false }).seo({ page: "/" });

    expect(upstream.received).toHaveLength(2);
  });
});

describe("outside a render", () => {
  it("every read goes out", async () => {
    unregister();
    const api = shop();

    await api.seo({ page: "/" });
    await api.seo({ page: "/" });

    expect(upstream.received).toHaveLength(2);
  });
});
