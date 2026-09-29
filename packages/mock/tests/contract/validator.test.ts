import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateSource } from "../../src/contract/validator";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response(z.array(User)),
    getById: endpoint
      .get(":id")
      .variables(z.object({ id: z.number() }))
      .response(User),
  },
});

const api = defineApi({ baseURL: "http://placeholder.invalid", groups: { users } });

const responses = new Map<string, unknown>([
  ["users/getAll", [{ id: 1, name: "Alice" }]],
  ["users/getById", { id: 1, name: "Alice" }],
]);

describe("validateSource variables", () => {
  it("checks the variables given for an endpoint against its variables schema", async () => {
    const variables = new Map<string, unknown>([["users/getById", { id: "1" }]]);

    const results = await validateSource(api, responses, {
      direction: "variables",
      variables,
    });

    const getById = results.find((r) => r.method === "getById");
    expect(getById?.target).toBe("variables");
    expect(getById?.status).toBe("fail");
    expect(getById?.issues?.[0]?.path).toBe("id");
  });

  it("passes variables that fit the schema", async () => {
    const variables = new Map<string, unknown>([["users/getById", { id: 1 }]]);

    const results = await validateSource(api, responses, {
      direction: "variables",
      variables,
    });

    expect(results.find((r) => r.method === "getById")?.status).toBe("pass");
  });

  it("checks both directions, each against its own data", async () => {
    const variables = new Map<string, unknown>([["users/getById", { id: 1 }]]);

    const results = await validateSource(api, responses, { direction: "both", variables });

    const byTarget = results.filter((r) => r.method === "getById").map((r) => [r.target, r.status]);
    expect(byTarget).toEqual([
      ["response", "pass"],
      ["variables", "pass"],
    ]);
  });

  it("skips the variables of an endpoint that has no variables schema", async () => {
    const variables = new Map<string, unknown>([["users/getAll", { page: 1 }]]);

    const results = await validateSource(api, responses, {
      direction: "variables",
      variables,
    });

    expect(results.find((r) => r.method === "getAll")?.status).toBe("skip");
  });

  it("skips the variables of an endpoint none were given for", async () => {
    const results = await validateSource(api, responses, { direction: "variables" });

    expect(results.find((r) => r.method === "getById")?.status).toBe("skip");
  });
});
