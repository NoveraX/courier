/**
 * A specification may tell two operations at one path apart by a query it
 * writes into the path, as OpenAI's does with `/responses?beta=true`. The
 * client sends that query as it is; the mock routes by the path and lets
 * the endpoint whose query is fixed answer only a request that carries it,
 * so each operation gets its own answer rather than its twin's.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { analyzeRoutes } from "../src/auto/route-analyzer";
import { splitQuery } from "../src/auto/split-query";

const { endpoint } = courier();
const Response = z.object({ id: z.string(), status: z.string() });
const BetaResponse = z.object({ id: z.string(), beta: z.boolean() });

function api(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      responses: defineGroup({
        prefix: "/",
        endpoints: {
          create: endpoint.post("responses").response(Response),
          betaCreate: endpoint.post("responses?beta=true").response(BetaResponse),
          get: endpoint.get("responses/:id").variables<{ id: string }>().response(Response),
          betaGet: endpoint
            .get("responses/:id?beta=true")
            .variables<{ id: string }>()
            .response(BetaResponse),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

describe("splitQuery", () => {
  it("splits a declared path at the query it fixes", () => {
    expect(splitQuery("responses/:id?beta=true&v=2")).toEqual({
      path: "responses/:id",
      query: "beta=true&v=2",
      fixed: { beta: "true", v: "2" },
    });
    expect(splitQuery("responses/:id")).toEqual({
      path: "responses/:id",
      query: "",
      fixed: undefined,
    });
  });
});

describe("an endpoint whose path fixes a query", () => {
  it("is analyzed at its path, its query fixed, as no collection's CRUD", () => {
    const routes = analyzeRoutes(api("http://placeholder.invalid"));

    expect(routes.map((r) => [r.endpoint, r.path, r.fullPath, r.operation, r.fixedQuery])).toEqual([
      ["create", "responses", "/responses", "custom", undefined],
      ["betaCreate", "responses", "/responses?beta=true", "custom", { beta: "true" }],
      ["get", "responses/:id", "/responses/:id", "get", undefined],
      ["betaGet", "responses/:id", "/responses/:id?beta=true", "custom", { beta: "true" }],
    ]);
  });

  it("answers a request that carries its query, and leaves the others to its twin", async () => {
    const server = createAutoMockServer({
      source: api("http://placeholder.invalid"),
      port: 0,
      log: false,
      seed: { count: 2 },
    });
    running.push(server);
    const client = createCaller(api((await server.start()).url));

    await expect(client.responses.betaCreate()).resolves.toMatchObject({
      beta: expect.any(Boolean),
    });
    await expect(client.responses.create()).resolves.toMatchObject({ status: expect.any(String) });
    await expect(client.responses.betaGet({ id: "id-1" })).resolves.toMatchObject({
      beta: expect.any(Boolean),
    });
    await expect(client.responses.get({ id: "id-1" })).resolves.toMatchObject({ id: "id-1" });
  });
});
