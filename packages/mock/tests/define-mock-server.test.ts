/**
 * What `defineMockServer` accepts, checked by the compiler: scenarios written
 * for its source or for none, never one written for another source, and no
 * option nothing reads. The scenario bodies are type-checked and never run.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { defineScenario } from "../src";
import { defineMockServer } from "../src/managed";

const { endpoint } = courier();
const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<Array<{ id: number }>>() } });
const orders = defineGroup({ prefix: "orders", endpoints: { list: endpoint.get("").response<Array<{ id: string }>>() } });
const api = defineApi({ baseURL: "https://api.example", groups: { users } });
const otherApi = defineApi({ baseURL: "https://other.example", groups: { orders } });
const largerApi = defineApi({ baseURL: "https://api.example", groups: { users, orders } });

describe("defineMockServer scenarios", () => {
  it("accepts a scenario written for its source, and one written for none", () => {
    const typed = defineScenario<typeof api>("typed", (mock) => void mock("users", "getAll").resolves([]));
    const untyped = defineScenario("untyped", (mock) => void mock("users", "getAll").resolves([]));
    const plain = { name: "plain", apply: () => {} };

    const definition = defineMockServer({ source: api, scenarios: { typed, untyped, plain } });

    expect(Object.keys(definition.scenarios ?? {})).toEqual(["typed", "untyped", "plain"]);
  });

  it("rejects a scenario written for another source", () => {
    const foreign = defineScenario<typeof otherApi>("foreign", (mock) => void mock("orders", "list").resolves([]));

    // @ts-expect-error the scenario mocks orders, which this source does not have
    defineMockServer({ source: api, scenarios: { foreign } });
  });

  it("rejects a scenario written for a source with endpoints this one lacks", () => {
    const larger = defineScenario<typeof largerApi>("larger", (mock) => void mock("orders", "list").resolves([]));

    // @ts-expect-error the scenario may mock orders, which this source does not have
    defineMockServer({ source: api, scenarios: { larger } });
  });

  it("accepts a scenario written for a source whose endpoints this one has", () => {
    const smaller = defineScenario<typeof api>("smaller", (mock) => void mock("users", "getAll").resolves([]));

    expect(defineMockServer({ source: largerApi, scenarios: { smaller } }).scenarios).toHaveProperty("smaller");
  });
});

describe("defineMockServer options", () => {
  it("does not start at launch when autoStart is given as undefined", () => {
    const autoStart: boolean | undefined = undefined;

    expect(defineMockServer({ source: api, autoStart }).autoStart).toBe(false);
  });

  it("has no name, which nothing read; Studio names a mock by its key", () => {
    // @ts-expect-error `name` is not an option
    const definition = defineMockServer({ source: api, name: "Users API" });

    expect(definition.autoStart).toBe(false);
  });
});
