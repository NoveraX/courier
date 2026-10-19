/**
 * A path sends a doubled colon as one, for an API whose methods put a colon
 * before a word, as Google's do: `index::inspect` reaches the server as
 * `index:inspect` — from a call and from a stream — beside a parameter in
 * the same segment too, and an OpenAPI document writes the path the same way.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define";
import { toOpenAPI } from "../src/openapi";

const { endpoint, stream } = courier();
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

/* A server that records each request as it arrived, and answers a `:watch` with a stream. */
async function upstream(): Promise<{ origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", body });
      const streams = req.url?.endsWith(":watch") === true;
      res.writeHead(200, { "content-type": streams ? "text/event-stream" : "application/json" });
      res.end(streams ? 'data: {"n":1}\n\nevent: courier:complete\ndata: \n\n' : "{}");
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, seen };
}

function google(origin: string) {
  return defineApi({
    name: "google",
    baseURL: origin,
    groups: {
      inspection: defineGroup({
        prefix: "v1/urlInspection",
        endpoints: {
          inspect: endpoint
            .post("index::inspect")
            .variables(z.object({ inspectionUrl: z.string(), siteUrl: z.string() }))
            .response(z.unknown()),
        },
      }),
      sheets: defineGroup({
        prefix: "v4/spreadsheets",
        endpoints: {
          batchUpdate: endpoint
            .post(":spreadsheetId::batchUpdate")
            .variables(z.object({ spreadsheetId: z.string(), requests: z.array(z.unknown()) }))
            .response(z.unknown()),
          watch: stream
            .variables<{ spreadsheetId: string }>()
            .response<unknown>()
            .get(":spreadsheetId::watch"),
        },
      }),
    },
  });
}

describe("a path with a doubled colon", () => {
  it("is requested with one colon, its variables sent as the body", async () => {
    const { origin, seen } = await upstream();
    const caller = createCaller(google(origin));

    await caller.inspection.inspect({
      inspectionUrl: "https://site.test/a",
      siteUrl: "sc-domain:site.test",
    });

    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url).toBe("/v1/urlInspection/index:inspect");
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual({
      inspectionUrl: "https://site.test/a",
      siteUrl: "sc-domain:site.test",
    });
  });

  it("fills the parameter the colon follows, and leaves it out of the body", async () => {
    const { origin, seen } = await upstream();
    const caller = createCaller(google(origin));

    await caller.sheets.batchUpdate({ spreadsheetId: "sheet 1", requests: [] });

    expect(seen[0]?.url).toBe("/v4/spreadsheets/sheet%201:batchUpdate");
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ requests: [] });
  });

  it("is opened with one colon for a stream", async () => {
    const { origin, seen } = await upstream();
    const caller = createCaller(google(origin));

    const data: unknown[] = [];
    for await (const event of await caller.sheets.watch({ spreadsheetId: "s1" })) {
      data.push(event.data);
    }

    expect(data).toEqual([{ n: 1 }]);
    expect(seen[0]?.url).toBe("/v4/spreadsheets/s1:watch");
  });

  it("is written with one colon in an OpenAPI document, its parameter in braces", () => {
    const { paths } = toOpenAPI(google("https://api.example.com"));

    expect(paths["/v1/urlInspection/index:inspect"]?.post?.operationId).toBe("inspection.inspect");
    const batchUpdate = paths["/v4/spreadsheets/{spreadsheetId}:batchUpdate"]?.post;
    expect(batchUpdate?.parameters).toEqual([
      { name: "spreadsheetId", in: "path", required: true, schema: { type: "string" } },
    ]);
    expect(Object.keys(paths)).toEqual([
      "/v1/urlInspection/index:inspect",
      "/v4/spreadsheets/{spreadsheetId}:batchUpdate",
      "/v4/spreadsheets/{spreadsheetId}:watch",
    ]);
  });
});
