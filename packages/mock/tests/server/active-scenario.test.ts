/**
 * The scenario the admin API reports as current, after one is applied
 * through the server itself, as Studio's Scenarios panel applies it: it
 * stayed null, so /__admin/scenarios disagreed with Studio.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineScenario } from "../../src/scenario/define-scenario";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

const empty = defineScenario("empty-users", (mock) => {
  mock("users", "list").resolves([]);
});

let server: MockServer;
let url: string;

beforeAll(async () => {
  server = createMockServer({ port: 0, log: false, scenarios: { "empty-users": empty } });
  ({ url } = await server.start());
});

afterAll(async () => {
  await server.stop();
});

describe("a scenario applied through the server", () => {
  it("is the one the admin API reports as current", async () => {
    server.applyScenario(empty);

    const listed = await fetch(`${url}/__admin/scenarios`).then((r) => r.json());

    expect(listed).toMatchObject({ current: "empty-users" });
  });
});
