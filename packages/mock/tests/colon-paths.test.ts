/**
 * @vitest-environment node
 *
 * Paths that put a colon before a word, as Google's methods do, served by
 * the mock where the client sends them: `index::inspect` at
 * `/v1/urlInspection/index:inspect`, and `:spreadsheetId::batchUpdate` at
 * `/v4/spreadsheets/s1:batchUpdate`, its parameter read out of the segment
 * it shares with text — while `/v4/spreadsheets/s1` is still the record
 * the catch-all names, and a segment that fits neither is not found.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { analyzeRoutes } from "../src/auto/route-analyzer";

const { endpoint } = courier();
const Sheet = z.object({ id: z.string(), title: z.string() });
const Done = z.object({ ok: z.boolean() });

function google(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      inspection: defineGroup({
        prefix: "v1/urlInspection",
        endpoints: {
          inspect: endpoint
            .post("index::inspect")
            .variables<{ inspectionUrl: string }>()
            .response(Done),
        },
      }),
      sheets: defineGroup({
        prefix: "v4/spreadsheets",
        endpoints: {
          get: endpoint.get(":id").variables<{ id: string }>().response(Sheet),
          batchUpdate: endpoint
            .post(":spreadsheetId::batchUpdate")
            .variables<{ spreadsheetId: string; requests: unknown[] }>()
            .response(Done),
          range: endpoint
            .get(":spreadsheetId/values/:from-:to")
            .variables<{ spreadsheetId: string; from: string; to: string }>()
            .response(Done),
        },
      }),
    },
  });
}

const server = createAutoMockServer({
  source: google("http://placeholder.invalid"),
  port: 0,
  log: false,
  seed: { count: 2 },
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

/* The endpoint the mock answered the last request with, and the variables it was given. */
const answered = () => {
  const last = server.history.at(-1);
  return last && { group: last.group, method: last.method, variables: last.variables };
};

describe("a path with a colon it sends as written", () => {
  it("is analyzed as a custom route, its colon no parameter", () => {
    const routes = analyzeRoutes(google("http://placeholder.invalid"));
    const of = (name: string) => routes.find((route) => route.endpoint === name);

    expect(of("inspect")).toMatchObject({ operation: "custom", hasIdParam: false });
    expect(of("inspect")?.fullPath).toBe("/v1/urlInspection/index::inspect");
    expect(of("batchUpdate")).toMatchObject({ operation: "custom", hasIdParam: true });
    expect(of("batchUpdate")?.idParam).toBeUndefined();
    expect(of("get")).toMatchObject({ operation: "get", idParam: "id" });
  });

  it("is served where the client sends it", async () => {
    const client = createCaller(google(url));

    await expect(
      client.inspection.inspect({ inspectionUrl: "https://site.test/a" }),
    ).resolves.toEqual({ ok: expect.any(Boolean) });
    expect(answered()).toEqual({
      group: "inspection",
      method: "inspect",
      variables: { inspectionUrl: "https://site.test/a" },
    });
  });

  it("reads the parameter out of the segment it shares with the colon", async () => {
    const client = createCaller(google(url));

    await client.sheets.batchUpdate({ spreadsheetId: "s1", requests: [] });
    expect(answered()).toEqual({
      group: "sheets",
      method: "batchUpdate",
      variables: { requests: [], spreadsheetId: "s1" },
    });

    const raw = await fetch(`${url}/v4/spreadsheets/a%3Ab:batchUpdate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requests: [1] }),
    });
    expect(raw.status).toBe(200);
    expect(answered()?.variables).toEqual({ requests: [1], spreadsheetId: "a:b" });
  });

  it("reads parameters a segment holds side by side", async () => {
    const client = createCaller(google(url));

    await client.sheets.range({ spreadsheetId: "s1", from: "A1", to: "B2" });
    expect(answered()).toEqual({
      group: "sheets",
      method: "range",
      variables: { spreadsheetId: "s1", from: "A1", to: "B2" },
    });
  });

  it("leaves the record a catch-all names to it, and finds no route for a segment that fits none", async () => {
    await fetch(`${url}/v4/spreadsheets/s1`);
    expect(answered()?.method).toBe("get");

    const before = server.history.length;
    const response = await fetch(`${url}/v4/spreadsheets/s1:archive`, { method: "POST" });
    expect(response.status).toBe(404);
    expect(server.history.length).toBe(before);
  });
});
