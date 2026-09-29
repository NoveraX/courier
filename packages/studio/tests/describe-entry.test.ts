/**
 * Describing a mock declared in courier.mocks, before it runs, from the
 * definition Studio already loaded. A definition that is wrong becomes a
 * problem reported on the mock, and a scenario that cannot be read to the end
 * is reported without failing the mock.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { defineMockServer, defineScenario } from "@noverax/courier-mock";
import { describe, expect, it } from "vitest";

import { describeEntry } from "../src/server/mock-manager/describe-entry";

const { endpoint } = courier();
const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get(""),
    getById: endpoint.get(":id").variables<{ id: string }>(),
  },
});
const api = defineApi({ baseURL: "https://api.example", groups: { users } });

describe("describeEntry", () => {
  it("lists the routes and collections of a definition, with its port", async () => {
    const described = await describeEntry(
      "apiMock",
      defineMockServer({ source: api, port: 7401, autoStart: true }),
    );

    expect(described).toMatchObject({
      description: { autoStart: true, port: 7401, collections: ["users"] },
    });
    const routes =
      "description" in described
        ? described.description.routes.map((r) => `${r.httpMethod} ${r.fullPath}`)
        : [];
    expect(routes).toEqual(["GET /users", "GET /users/:id"]);
  });

  it("reports a value that is not a mock definition", async () => {
    await expect(describeEntry("broken", { autoStart: true })).resolves.toEqual({
      problem: 'Mock "broken" in courier.mocks is not a defineMockServer() definition.',
    });
  });

  it("reports a thrown value that has no string form, instead of failing on it", async () => {
    const definition = defineMockServer({ source: api });
    Object.defineProperty(definition, "source", {
      get() {
        throw Object.create(null);
      },
    });

    await expect(describeEntry("apiMock", definition)).resolves.toEqual({
      problem: 'Mock "apiMock" could not be described: [Object: null prototype] {}',
    });
  });

  it("reports a scenario that throws while it is read, and still describes the mock", async () => {
    const scenario = defineScenario("boom", () => {
      throw new Error("scenario exploded");
    });

    const described = await describeEntry(
      "apiMock",
      defineMockServer({ source: api, scenarios: { boom: scenario } }),
    );

    const boom =
      "description" in described
        ? described.description.scenarios.find((s) => s.name === "boom")
        : undefined;
    expect(boom?.introspectionError).toBe("scenario exploded");
  });
});
