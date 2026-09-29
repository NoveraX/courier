/**
 * The Remix handler serving what a proxy caller sends: a read over GET, a
 * write over POST, a stream, and a page on another site. The adapter's own
 * code is a thin call into the core handler; these calls pin that it passes
 * the request through whole, as a Remix loader and action receive it.
 */
import { courier, defineApi, defineGroup, type Sources } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { courierHandler } from "../src/index";

const { endpoint, stream } = courier();

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
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      byId: endpoint.get(":id").variables<{ id: string }>(),
      create: endpoint.post("").variables<{ name: string }>(),
    },
  });
  const live = defineGroup({
    prefix: "live",
    endpoints: {
      ticks: stream.response<number>().implement(async function* () {
        yield { data: 1 };
        yield { data: 2 };
      }),
    },
  });
  return { api: defineApi({ baseURL: upstream.url, groups: { users, live } }) };
}

/* Each event of a server-sent event stream, as its name and its data. */
function eventsOf(body: string): [string, string][] {
  return body
    .split("\n\n")
    .filter((block) => /^data: /m.test(block))
    .map((block) => [
      /^event: (.*)$/m.exec(block)?.[1] ?? "message",
      /^data: (.*)$/m.exec(block)?.[1] ?? "",
    ]);
}

describe("the Remix handler", () => {
  it("answers a read with what the upstream returned, its variables in the address", async () => {
    const handler = courierHandler({ sources: await sourcesFor() });
    const read = new URL("http://localhost:4321/api/request?_s=api&_g=users&_m=byId");
    read.searchParams.set("_v", JSON.stringify({ id: "7" }));

    const response = await handler({ request: new Request(read) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ method: "GET", url: "/users/7", body: "" });
  });

  it("sends a write's variables upstream as its body", async () => {
    const handler = courierHandler({ sources: await sourcesFor() });
    const request = new Request("http://localhost:4321/api/request?_s=api&_g=users&_m=create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variables: { name: "Ada" } }),
    });

    const response = await handler({ request });

    expect(await response.json()).toEqual({
      method: "POST",
      url: "/users",
      body: '{"name":"Ada"}',
    });
  });

  it("streams the events of a stream this process serves", async () => {
    const handler = courierHandler({ sources: await sourcesFor() });
    const request = new Request("http://localhost:4321/api/request?_s=api&_g=live&_m=ticks", {
      headers: { accept: "text/event-stream" },
    });

    const response = await handler({ request });
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(eventsOf(body)).toEqual([
      ["message", "1"],
      ["message", "2"],
      ["courier:complete", "null"],
    ]);
  });

  it("refuses a request a page on another site made", async () => {
    const handler = courierHandler({ sources: await sourcesFor() });
    const request = new Request("http://localhost:4321/api/request?_s=api&_g=users&_m=create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://elsewhere.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ variables: { name: "Ada" } }),
    });

    const response = await handler({ request });

    expect(response.status).toBe(403);
    expect(upstream?.received).toEqual([]);
  });
});
