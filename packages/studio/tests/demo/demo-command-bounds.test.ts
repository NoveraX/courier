/**
 * A public demo keeps a visitor's mock commands in bounds: a seed the mock
 * serves at once, latencies a visitor can wait out, answers and uploads not
 * slowed to a crawl, a collection grown no larger than it keeps. What the demo does not
 * bound is left to the mock.
 */
import { describe, expect, it } from "vitest";

import { DEMO_MAX_RECORDS, demoCommandProblem } from "../../src/server/demo/demo-command-bounds";

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

    expect(bandwidth(1)).toBe("The demo caps a mock's answers and uploads at 256 Kbps or faster.");
    expect(bandwidth(512)).toBeNull();
    expect(bandwidth(0)).toBeNull();
  });

  it("caps uploads at 256 Kbps or faster, as it caps answers", () => {
    const uploads = (kbps: number) =>
      demoCommandProblem({
        action: "mock:network:set",
        serverId: "shop",
        config: { uploads: { bandwidth: kbps } },
      });

    expect(uploads(64)).toBe("The demo caps a mock's answers and uploads at 256 Kbps or faster.");
    expect(uploads(1500)).toBeNull();
  });

  it("takes an upload size limit, a count of bytes, whatever its size", () => {
    const set = (config: unknown) =>
      demoCommandProblem({ action: "mock:network:set", serverId: "shop", config });

    expect(set({ uploads: { maxBytes: 5_242_880, accept: ["image/*"] } })).toBeNull();
    expect(
      set({ routeOverrides: [{ routeId: "users:avatar", uploads: { maxBytes: 1_048_576 } }] }),
    ).toBeNull();
    expect(set({ uploads: { maxBytes: 1_048_576 }, latency: 60_000 })).toContain(
      "10 s for a latency",
    );
  });

  it("leaves a command the demo does not bound to the mock", () => {
    expect(
      demoCommandProblem({ action: "mock:scenario:apply", serverId: "shop", scenario: "errors" }),
    ).toBeNull();
    expect(demoCommandProblem("not a command")).toBeNull();
  });
});

describe("a record a visitor adds to a mock's collection", () => {
  const create = { action: "mock:store:create", serverId: "shop", collection: "users", record: {} };

  it("is added while the collection holds fewer than the demo keeps", () => {
    expect(demoCommandProblem(create, () => DEMO_MAX_RECORDS - 1)).toBeNull();
  });

  it("is refused once the collection holds as many as the demo keeps, saying how to add one", () => {
    expect(demoCommandProblem(create, () => DEMO_MAX_RECORDS)).toBe(
      "The demo keeps up to 1000 records in a collection. Delete some to add another.",
    );
  });

  it("is left to the mock when Studio does not know the collection", () => {
    expect(demoCommandProblem(create, () => undefined)).toBeNull();
  });
});
