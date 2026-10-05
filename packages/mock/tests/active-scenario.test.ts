/**
 * The scenario in force: a mock built from a source starts on `happy-path`
 * — the state with no scenario on top — so switching back to it turns any
 * other off; a server started with a scenario says so; a reset leaves
 * `happy-path` in force; and Studio is told which one is in force as soon
 * as the mock is ready.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAutoMockServer } from "../src/auto/create-auto-server";
import { analyzeRoutes } from "../src/auto/route-analyzer";
import { buildScenarioMeta } from "../src/managed/scenario-meta";
import { createMockServer } from "../src/server/create-mock-server";

const { endpoint } = courier();

const Pet = z.object({ id: z.number().int(), name: z.string() });

const source = defineApi({
  baseURL: "http://localhost:9",
  groups: {
    pets: defineGroup({
      prefix: "pets",
      endpoints: {
        list: endpoint.get("").response(z.array(Pet)),
        get: endpoint.get(":id").variables<{ id: number }>().response(Pet),
      },
    }),
  },
});

async function current(app: { request: (path: string) => Response | Promise<Response> }) {
  const res = await app.request("/__admin/scenarios");
  const body: unknown = await res.json();
  return typeof body === "object" && body !== null ? Reflect.get(body, "current") : undefined;
}

describe("the scenario in force", () => {
  it("is happy-path when a mock built from a source starts, and switching back to it turns another off", async () => {
    const server = createAutoMockServer({ source, log: false });

    expect(server.activeScenario).toBe("happy-path");
    expect(await current(server.app)).toBe("happy-path");

    await server.app.request("/__admin/scenarios/empty", { method: "POST" });
    expect(server.activeScenario).toBe("empty");

    await server.app.request("/__admin/scenarios/happy-path", { method: "POST" });
    expect(server.activeScenario).toBe("happy-path");
    expect(server.getRouteSource("pets", "list")).toBe("auto");
  });

  it("is the scenario a server was started with", async () => {
    const outage = { name: "outage", apply: () => {} };
    const server = createMockServer({ scenario: outage, scenarios: { outage }, log: false });

    expect(server.activeScenario).toBe("outage");
    expect(await current(server.app)).toBe("outage");
  });

  it("is happy-path again after a reset", async () => {
    const server = createAutoMockServer({ source, log: false });
    await server.app.request("/__admin/scenarios/server-error", { method: "POST" });

    await server.app.request("/__admin/reset", { method: "POST" });

    expect(await current(server.app)).toBe("happy-path");
  });

  it("is the one Studio marks active when the mock is ready", () => {
    const server = createAutoMockServer({ source, log: false });

    const meta = buildScenarioMeta(server.scenarios, analyzeRoutes(source), server.activeScenario);

    expect(meta.filter((s) => s.isActive).map((s) => s.name)).toEqual(["happy-path"]);
  });
});
