/**
 * The built-in server-error scenario does what its description, shown in
 * Studio's Scenarios tab, says: it fails every endpoint with the one server
 * error it is given. The slow-network scenario is covered beside the auto
 * server's own tests.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const Item = z.object({ id: z.string(), name: z.string() });

const api = defineApi({
  baseURL: "https://test.api",
  groups: {
    items: defineGroup({
      prefix: "/items",
      endpoints: {
        list: endpoint.get("").response(z.array(Item)),
        get: endpoint.get(":id").response(Item),
        create: endpoint
          .post("")
          .variables(z.object({ name: z.string() }))
          .response(Item),
      },
    }),
  },
});

const server = createAutoMockServer({ source: api, port: 0, log: false, seed: { count: 2 } });
let url: string;

beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

async function timed(path: string): Promise<{ status: number; ms: number }> {
  const start = performance.now();
  const res = await fetch(`${url}${path}`);
  await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - start };
}

function preset(name: string) {
  const scenario = server.scenarios[name];
  if (!scenario) throw new Error(`no built-in scenario "${name}"`);
  return scenario;
}

describe("the built-in scenarios", () => {
  it("server-error fails each endpoint with the one server error it is given, as it says", async () => {
    const scenario = preset("server-error");
    server.applyScenario(scenario);

    const statuses = [await timed("/items"), await timed("/items"), await timed("/items/x")].map(
      (r) => r.status,
    );

    expect(scenario.description).toContain("depending on the endpoint");
    expect(statuses[0]).toBe(statuses[1]);
    expect(statuses[0]).not.toBe(statuses[2]);
    expect(statuses.every((status) => [500, 502, 503].includes(status))).toBe(true);
  });
});
