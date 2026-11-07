/**
 * The handlers `sseRoute()` gives the server route TanStack Start serves
 * the proxy's streams from: a stream over GET, a preflight over OPTIONS,
 * and every other method refused with 405 — a write never reaches the
 * route the streams are opened at.
 */
import { courier, defineApi, type Sources } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/server/sources";
import { startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { sseRoute } from "../src/index";

const { endpoint, stream } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

async function sourcesFor(): Promise<Sources> {
  upstream = await startUpstream((_request, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  return {
    api: defineApi({
      expose: true,
      baseURL: upstream.url,
      endpoints: {
        create: endpoint.post("users").variables<{ name: string }>(),
        ticks: stream.response<number>().implement(async function* () {
          yield { data: 1 };
          yield { data: 2 };
        }),
      },
    }),
  };
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

describe("sseRoute()", () => {
  it("streams the events of a stream over GET", async () => {
    const { GET } = sseRoute({ sources: await sourcesFor() });
    const request = new Request("http://localhost:3000/api/sse?_s=api&_m=ticks", {
      headers: { accept: "text/event-stream" },
    });

    const response = await GET({ request });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(eventsOf(await response.text())).toEqual([
      ["message", "1"],
      ["message", "2"],
      ["courier:complete", "null"],
    ]);
  });

  it("answers the preflight of a page allowedOrigins lists", async () => {
    const { OPTIONS } = sseRoute({
      sources: await sourcesFor(),
      allowedOrigins: ["https://admin.example.com"],
    });
    const request = new Request("http://localhost:3000/api/sse?_s=api&_m=ticks", {
      method: "OPTIONS",
      headers: { origin: "https://admin.example.com", "access-control-request-method": "GET" },
    });

    const response = await OPTIONS({ request });

    expect(response.ok).toBe(true);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://admin.example.com");
  });

  it("refuses a write with 405, naming the methods the route serves, and sends nothing", async () => {
    const { ANY } = sseRoute({ sources: await sourcesFor() });
    const request = new Request("http://localhost:3000/api/sse?_s=api&_m=create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variables: { name: "Ada" } }),
    });

    const response = await ANY({ request });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
    expect(upstream?.received).toEqual([]);
  });
});
