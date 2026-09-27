/**
 * `.raw` on a direct call, which hands back the upstream's own headers.
 *
 * The allowlist that decides what a proxy passes back to a browser was
 * applied to direct calls too, so a server-side caller reading `.raw` for its
 * pagination headers got an ETag and nothing else — no content type, no
 * `Link`, no `X-Total-Count`, no cookies — and a HEAD, which carries nothing
 * but headers, came back empty.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    res.writeHead(200, [
      ["content-type", "application/json"],
      ["x-total-count", "42"],
      ["link", '<https://api.example/items?page=2>; rel="next"'],
      ["etag", '"v1"'],
      ["set-cookie", "a=1; Path=/"],
      ["set-cookie", "b=2; Path=/"],
    ]);
    res.end(request.method === "HEAD" ? undefined : "[1,2]");
  });
});

afterEach(async () => {
  await upstream.close();
});

function client() {
  return createCaller(
    defineApi({
      name: "items",
      baseURL: upstream.url,
      endpoints: { list: endpoint.get("items"), probe: endpoint.head("items") },
    }),
  );
}

describe(".raw on a direct call", () => {
  it("carries every header the upstream sent", async () => {
    const response = await client().raw.list();

    expect(response.data).toEqual([1, 2]);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-total-count")).toBe("42");
    expect(response.headers.get("link")).toBe('<https://api.example/items?page=2>; rel="next"');
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("carries the headers of a HEAD answer", async () => {
    const response = await client().raw.probe();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-total-count")).toBe("42");
  });

  it("agrees with a streamed .raw call", async () => {
    const buffered = await client().raw.list();
    const streamed = await client().raw.with({ stream: true }).list();

    expect([...buffered.headers.keys()]).toEqual([...streamed.headers.keys()]);
  });
});
