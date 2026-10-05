/**
 * A scenario takes the place of the one on only once its whole definition
 * has run: one that fails part-way leaves the mock answering as before.
 */
import { describe, expect, it } from "vitest";

import { createMockRegistry } from "../src/registry";
import { defineScenario } from "../src/scenario";
import { createScenarioControls } from "../src/server/scenario-controls";

function controls() {
  const registry = createMockRegistry();
  const states: string[] = [];
  const callCounts = new Map<string, number>();
  const scenarios = createScenarioControls({
    registry,
    callCounts,
    setScenarioState: (state) => states.push(state),
  });
  return { registry, states, callCounts, ...scenarios };
}

describe("a scenario applied", () => {
  it("answers with every route it defines once applied", () => {
    const { registry, applyScenario, states } = controls();

    applyScenario(
      defineScenario("empty", (mock) => {
        mock("users", "list").resolves([]);
        mock("orders", "list").resolves([]);
      }),
    );

    expect([registry.hasScenario("users", "list"), registry.hasScenario("orders", "list")]).toEqual(
      [true, true],
    );
    expect(states).toEqual(["Started"]);
  });

  it("leaves the scenario on in place when its definition fails part-way", () => {
    const { registry, applyScenario, states, callCounts } = controls();
    applyScenario(
      defineScenario("first", (mock) => {
        mock("users", "get").resolves({ id: 1 });
      }),
    );
    const before = registry.peek("users", "get");
    callCounts.set("users/get", 3);

    const broken = defineScenario("broken", (mock) => {
      mock("users", "list").resolves([]);
      throw new Error("the definition failed part-way");
    });

    expect(() => applyScenario(broken)).toThrow("the definition failed part-way");
    expect(registry.peek("users", "get")).toBe(before);
    expect(registry.hasScenario("users", "list")).toBe(false);
    expect(callCounts.get("users/get")).toBe(3);
    expect(states).toEqual(["Started"]);
  });
});
