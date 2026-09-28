import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { createMockClient } from "../src/create-mock-client";
import { defineScenario } from "../src/scenario";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "http://mock.test",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response<string[]>() },
    }),
  },
});

const authFlow = defineScenario<typeof api>("auth-flow", (mock) => {
  mock("users", "getAll").inState("unauthorized").rejects(401);
  mock("users", "getAll").inState("authorized").resolves(["alice"]);
});

describe("createMockClient scenario state", () => {
  it("starts an applied scenario in its initial state", async () => {
    const mc = createMockClient<typeof api>();
    mc.applyScenario({ ...authFlow, initialState: "unauthorized" });

    const error = await mc.client.users.getAll().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HTTPError);
    expect(error instanceof HTTPError && error.status).toBe(401);
  });

  it("starts the scenario passed at creation in its initial state", async () => {
    const mc = createMockClient<typeof api>({
      scenario: { ...authFlow, initialState: "authorized" },
    });

    expect(await mc.client.users.getAll()).toEqual(["alice"]);
    expect(mc.scenarioState).toBe("authorized");
  });

  it("starts a scenario without an initial state in Started", () => {
    const mc = createMockClient<typeof api>();
    mc.transition("elsewhere");
    mc.applyScenario(authFlow);

    expect(mc.scenarioState).toBe("Started");
  });

  it("reports the state a call moved to, and the state set by transition", async () => {
    const mc = createMockClient<typeof api>();
    mc.mock("users", "getAll").transitionTo("listed").resolves([]);

    await mc.client.users.getAll();
    const afterCall = mc.scenarioState;
    mc.transition("other");
    const afterTransition = mc.scenarioState;
    mc.reset();

    expect([afterCall, afterTransition, mc.scenarioState]).toEqual(["listed", "other", "Started"]);
  });
});
