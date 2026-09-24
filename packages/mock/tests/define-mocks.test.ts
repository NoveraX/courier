/**
 * What courier.mocks.ts declares, checked by the compiler: a mock definition
 * for any source under each key, or nothing — never a source, a string, or
 * options that were not passed through defineMockServer.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { defineMocks, defineMockServer, defineScenario } from "../src";

const { endpoint } = courier();
type User = { id: number };
const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<User[]>() } });
const api = defineApi({ baseURL: "https://api.example", groups: { users } });
const billing = defineApi({ baseURL: "https://billing.example", endpoints: { invoices: endpoint.get("invoices") } });
const outage = defineScenario<typeof api>("outage", (mock) => {
  mock("users", "getAll").rejects(503);
});

describe("defineMocks", () => {
  it("takes definitions written for different sources, and a key left undefined", () => {
    const mocks = defineMocks({
      api: defineMockServer({ source: api, scenarios: { outage } }),
      billing: defineMockServer({ source: billing, autoStart: true }),
      off: undefined,
    });

    expect(Object.keys(mocks)).toEqual(["api", "billing", "off"]);
    expect(mocks.billing.autoStart).toBe(true);
  });

  it("rejects a source in place of a mock definition", () => {
    // @ts-expect-error a source is not a mock definition
    defineMocks({ api });
  });

  it("rejects options that were not passed through defineMockServer", () => {
    // @ts-expect-error `{ source, port }` has no `__type`
    defineMocks({ api: { source: api, port: 7001 } });
  });

  it("rejects a path to a mock file", () => {
    // @ts-expect-error a string is not a mock definition
    defineMocks({ api: "./mocks/api.ts" });
  });
});
