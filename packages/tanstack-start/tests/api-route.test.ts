/**
 * The handlers `apiRoute()` gives the server route TanStack Start serves the
 * proxy from: a read over GET, a write over POST, a preflight over OPTIONS,
 * and every other method refused with 405 rather than left to TanStack
 * Start, which answers a method a route has no handler for with the
 * application's page.
 */
import { courier, defineApi, type Sources } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/server/sources";
import { startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { apiRoute } from "../src/index";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

async function sourcesFor(): Promise<Sources> {
  upstream = await startUpstream((request, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ method: request.method, url: request.url, body: request.body.toString() }),
    );
  });
  return {
    api: defineApi({
      expose: true,
      baseURL: upstream.url,
      endpoints: {
        byId: endpoint.get("users/:id").variables<{ id: string }>(),
        create: endpoint.post("users").variables<{ name: string }>(),
      },
    }),
  };
}

const write = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/request?_s=api&_m=create", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ variables: { name: "Ada" } }),
  });

/* A body that says whether all of it was taken off the connection. */
function trackedBody(): { body: ReadableStream<Uint8Array>; drained: Promise<void> } {
  let drained: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    drained = resolve;
  });
  const chunks = [new TextEncoder().encode("first"), new TextEncoder().encode("second")];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk === undefined) {
        controller.close();
        drained();
      } else controller.enqueue(chunk);
    },
  });
  return { body, drained: done };
}

describe("apiRoute()", () => {
  it("answers a read over GET with what the upstream returned, its variables in the address", async () => {
    const { GET } = apiRoute({ sources: await sourcesFor() });
    const read = new URL("http://localhost:3000/api/request?_s=api&_m=byId");
    read.searchParams.set("_v", JSON.stringify({ id: "7" }));

    const response = await GET({ request: new Request(read) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ method: "GET", url: "/users/7", body: "" });
  });

  it("sends a write over POST upstream, its variables as the body", async () => {
    const { POST } = apiRoute({ sources: await sourcesFor() });

    const response = await POST({ request: write() });

    expect(await response.json()).toEqual({
      method: "POST",
      url: "/users",
      body: '{"name":"Ada"}',
    });
  });

  it("refuses a write a page on another site made, sending nothing", async () => {
    const { POST } = apiRoute({ sources: await sourcesFor() });

    const response = await POST({
      request: write({ origin: "https://elsewhere.example", "sec-fetch-site": "cross-site" }),
    });

    expect(response.status).toBe(403);
    expect(upstream?.received).toEqual([]);
  });

  it("answers the preflight of a page allowedOrigins lists, and refuses another site's", async () => {
    const { OPTIONS } = apiRoute({
      sources: await sourcesFor(),
      allowedOrigins: ["https://admin.example.com"],
    });
    const preflight = (origin: string) =>
      new Request("http://localhost:3000/api/request?_s=api&_m=create", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });

    const listed = await OPTIONS({ request: preflight("https://admin.example.com") });
    const other = await OPTIONS({ request: preflight("https://elsewhere.example") });

    expect(listed.ok).toBe(true);
    expect(listed.headers.get("access-control-allow-origin")).toBe("https://admin.example.com");
    expect(other.status).toBe(403);
  });

  it("refuses any other method with 405, naming the ones it serves, and takes the body off the connection", async () => {
    const { ANY } = apiRoute({ sources: await sourcesFor() });
    const { body, drained } = trackedBody();
    const init: RequestInit & { duplex: "half" } = { method: "PUT", body, duplex: "half" };
    const request = new Request("http://localhost:3000/api/request?_s=api&_m=create", init);

    const response = await ANY({ request });
    await drained;

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, OPTIONS");
    expect(await response.text()).toBe("");
    expect(upstream?.received).toEqual([]);
  });
});
