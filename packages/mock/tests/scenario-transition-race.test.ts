/**
 * A transition takes effect once its request has waited out its latency.
 * Applied then without a check, it overwrote a scenario applied meanwhile,
 * and moved the state on from one it was no longer in.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";
import { defineScenario } from "../src/scenario";
import { createScenarioState } from "../src/scenario/scenario-state";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://api.example",
  groups: {
    session: defineGroup({
      prefix: "session",
      endpoints: {
        login: endpoint.post("login").response<{ ok: boolean }>(),
        refresh: endpoint.post("refresh").response<{ ok: boolean }>(),
      },
    }),
  },
});

describe("createScenarioState", () => {
  it("takes a transition from the state the request was matched in", () => {
    const scenario = createScenarioState();
    const mark = scenario.mark();

    scenario.transition(mark, "LoggedIn");

    expect(scenario.get()).toBe("LoggedIn");
  });

  it("drops a transition once the state was set outright, even back to the same state", () => {
    const scenario = createScenarioState();
    const mark = scenario.mark();

    scenario.set("Started");
    scenario.transition(mark, "LoggedIn");

    expect(scenario.get()).toBe("Started");
  });

  it("drops a transition from a state another transition has left", () => {
    const scenario = createScenarioState();
    const first = scenario.mark();
    const second = scenario.mark();

    scenario.transition(first, "A");
    scenario.transition(second, "B");

    expect(scenario.get()).toBe("A");
  });
});

describe("a mock whose request is still waiting when a scenario is applied", () => {
  it("leaves the applied scenario's state alone", async () => {
    const mocks = createMockClient<typeof api>();
    mocks.mock("session", "login").delay(30).resolves({ ok: true }).transitionTo("LoggedIn");

    const call = mocks.client.session.login();
    mocks.applyScenario(defineScenario("fresh", () => undefined));
    await call;

    expect(mocks.scenarioState).toBe("Started");
  });

  it("does not move the state on from one another request already left", async () => {
    const mocks = createMockClient<typeof api>();
    mocks.mock("session", "login").delay(10).resolves({ ok: true }).transitionTo("LoggedIn");
    mocks.mock("session", "refresh").delay(40).resolves({ ok: true }).transitionTo("Expired");

    await Promise.all([mocks.client.session.login(), mocks.client.session.refresh()]);

    expect(mocks.scenarioState).toBe("LoggedIn");
  });
});
