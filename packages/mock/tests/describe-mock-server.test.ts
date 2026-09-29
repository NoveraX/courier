/**
 * What Studio shows of a declared mock before it runs: its port and launch,
 * its routes with their schemas, and its scenarios, each read in full or
 * marked as read only in part. Describing runs inside Studio's own process,
 * so no scenario may fail it.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { defineScenario } from "../src";
import { defineMockServer, describeMockServer } from "../src/managed";

const { endpoint } = courier();
const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<Array<{ id: string }>>(),
    getById: endpoint.get(":id").variables<{ id: string }>(),
  },
});
const api = defineApi({ baseURL: "https://api.example", groups: { users } });

describe("describeMockServer", () => {
  it("names no port when the definition names none, and does not start at launch", () => {
    const description = describeMockServer(defineMockServer({ source: api }));

    expect("port" in description).toBe(false);
    expect(description.autoStart).toBe(false);
  });

  it("names the port and launch the definition asks for", () => {
    expect(
      describeMockServer(defineMockServer({ source: api, port: 7401, autoStart: true })),
    ).toMatchObject({
      port: 7401,
      autoStart: true,
    });
  });

  it("lists the routes and collections the source generates", () => {
    const description = describeMockServer(defineMockServer({ source: api }));

    expect(description.routes.map((r) => `${r.httpMethod} ${r.fullPath}`)).toEqual([
      "GET /users",
      "GET /users/:id",
    ]);
    expect(description.collections).toEqual(["users"]);
  });

  it("lists the scenarios the running server has, each read in full", () => {
    const quiet = defineScenario("quiet", (mock) => {
      mock("users", "getAll").resolves([]);
    });

    const { scenarios } = describeMockServer(
      defineMockServer({ source: api, scenarios: { quiet } }),
    );

    expect(scenarios[0]?.name).toBe("happy-path");
    expect(scenarios.map((s) => s.name)).toContain("quiet");
    expect(scenarios.filter((s) => s.introspectionError !== undefined)).toEqual([]);
  });
});

describe("describeMockServer reading scenarios", () => {
  it("reads a scenario that uses every builder method to the end", () => {
    const busy = defineScenario<typeof api>("busy", (mock) => {
      mock("users", "getAll").resolves([]).times(2).once().withHeaders({}).withStatus(200);
      mock("users", "getById").rejects(404).delay(10);
    });

    const scenario = describeMockServer(
      defineMockServer({ source: api, scenarios: { busy } }),
    ).scenarios.find((s) => s.name === "busy");

    expect(scenario?.introspectionError).toBeUndefined();
    expect(scenario?.endpoints.map((e) => `${e.endpoint}:${e.behavior}`)).toEqual([
      "getAll:resolves",
      "getById:rejects",
    ]);
  });

  it("lists a streaming or channel override as custom", () => {
    const live = defineScenario<typeof api>("live", (mock) => {
      mock("users", "getAll").emits([]);
      mock("users", "getById").channel(() => ({ onMessage: () => undefined }));
    });

    const scenario = describeMockServer(
      defineMockServer({ source: api, scenarios: { live } }),
    ).scenarios.find((s) => s.name === "live");

    expect(scenario?.introspectionError).toBeUndefined();
    expect(scenario?.endpoints.map((e) => e.behavior)).toEqual(["custom", "custom"]);
  });

  it("marks an async scenario as read only in part, and leaves no rejection unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const later = {
      name: "later",
      apply: async () => {
        await Promise.resolve();
        throw new Error("set up too late");
      },
    };

    const scenario = describeMockServer(
      defineMockServer({ source: api, scenarios: { later } }),
    ).scenarios.find((s) => s.name === "later");
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", onUnhandled);

    expect(scenario?.introspectionError).toMatch(/returned a promise/);
    expect(unhandled).toEqual([]);
  });

  it("marks a defineScenario with an async setup as read only in part", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const later = defineScenario<typeof api>("later", async (mock) => {
      await Promise.resolve();
      mock("users", "getAll").resolves([]);
      throw new Error("set up too late");
    });

    const scenario = describeMockServer(
      defineMockServer({ source: api, scenarios: { later } }),
    ).scenarios.find((s) => s.name === "later");
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", onUnhandled);

    expect(scenario?.introspectionError).toMatch(/async setup/);
    expect(unhandled).toEqual([]);
  });
});

describe("describeMockServer routes", () => {
  it("gives each route an average latency to start from", () => {
    const { routes } = describeMockServer(defineMockServer({ source: api }));

    expect(routes.every((route) => route.avgLatency === 0 && route.hits === 0)).toBe(true);
  });

  it("says a definition has no source, rather than failing inside it", () => {
    const { source: _source, ...definition } = defineMockServer({ source: api });

    expect(() =>
      describeMockServer(definition as unknown as Parameters<typeof describeMockServer>[0]),
    ).toThrow("has no source");
  });

  it("says a source given as a value that was not defined yet is undefined", () => {
    const definition = {
      ...defineMockServer({ source: api }),
      source: undefined,
    } as unknown as Parameters<typeof describeMockServer>[0];

    expect(() => describeMockServer(definition)).toThrow(
      "The mock server's source is undefined: the value given to defineMockServer() as source was not defined",
    );
  });
});
