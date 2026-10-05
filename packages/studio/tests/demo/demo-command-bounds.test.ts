/**
 * A public demo keeps a visitor's mock commands in bounds: a seed the mock
 * serves at once, latencies a visitor can wait out, answers not slowed to a
 * crawl. What the demo does not bound is left to the mock.
 */
import { describe, expect, it } from "vitest";

import { demoCommandProblem } from "../../src/server/demo/demo-command-bounds";

describe("a visitor's mock command", () => {
  it("seeds up to 200 records at a time", () => {
    expect(demoCommandProblem({ action: "mock:store:seed", serverId: "shop", count: 200 })).toBe(
      null,
    );
    expect(demoCommandProblem({ action: "mock:store:seed", serverId: "shop", count: 201 })).toBe(
      "The demo seeds up to 200 records at a time.",
    );
  });

  it("keeps latency and failure settings at 10 000 or under, wherever they sit", () => {
    const set = (config: unknown) =>
      demoCommandProblem({ action: "mock:network:set", serverId: "shop", config });

    expect(set({ latency: { min: 300, max: 900 }, bandwidth: 10_000 })).toBeNull();
    expect(set({ latency: { min: 300, max: 60_000 } })).toContain("10 s for a latency");
    expect(
      demoCommandProblem({
        action: "mock:chaos:set",
        serverId: "shop",
        config: { routeOverrides: [{ routeId: "orders:create", latency: 50_000 }] },
      }),
    ).toContain("at 10000 or under");
  });

  it("refuses a setting nested deeper than a mock reads", () => {
    let config: unknown = 1;
    for (let level = 0; level < 10; level++) config = { level: config };

    expect(demoCommandProblem({ action: "mock:chaos:set", serverId: "shop", config })).toContain(
      "10 s for a latency",
    );
  });

  it("caps answers at 256 Kbps or faster, and lets a cap be lifted", () => {
    const bandwidth = (kbps: number) =>
      demoCommandProblem({
        action: "mock:network:set",
        serverId: "shop",
        config: { bandwidth: kbps },
      });

    expect(bandwidth(1)).toBe("The demo caps a mock's answers at 256 Kbps or faster.");
    expect(bandwidth(512)).toBeNull();
    expect(bandwidth(0)).toBeNull();
  });

  it("leaves a command the demo does not bound to the mock", () => {
    expect(
      demoCommandProblem({ action: "mock:scenario:apply", serverId: "shop", scenario: "errors" }),
    ).toBeNull();
    expect(demoCommandProblem("not a command")).toBeNull();
  });
});
