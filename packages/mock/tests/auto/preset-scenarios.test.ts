import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../../src/auto/create-auto-server";
import type { MockServer } from "../../src/server/create-mock-server";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        list: endpoint.get("").response(z.array(User)),
        get: endpoint.get(":id").variables<{ id: number }>().response(User),
        create: endpoint.post("").variables<{ name: string }>().response(User),
      },
    }),
  },
});

let server: MockServer;
let url: string;

beforeAll(async () => {
  server = createAutoMockServer({ source: api, port: 0, log: false, seed: { count: 3 } });
  ({ url } = await server.start());
  await fetch(`${url}/__admin/scenarios/slow-network`, { method: "POST" });
});

afterAll(async () => {
  await server.stop();
});

async function elapsed(path: string, init?: RequestInit): Promise<number> {
  const start = performance.now();
  await fetch(`${url}${path}`, init).then((res) => res.json());
  return performance.now() - start;
}

describe("the slow-network preset", () => {
  it("says what it slows down, and by how much", () => {
    const { description } = server.scenarios["slow-network"] ?? {};

    expect(description).toContain("every read endpoint");
    expect(description).toContain("300–900 ms");
    expect(description).not.toMatch(/2000|all endpoints/);
  });

  it("slows the read endpoints by 3G latency", async () => {
    expect(await elapsed("/users")).toBeGreaterThanOrEqual(150);
    expect(await elapsed("/users/1")).toBeGreaterThanOrEqual(150);
  });

  it("leaves the writes as fast as without it", async () => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Dana" }),
    };
    expect(await elapsed("/users", init)).toBeLessThan(100);
  });
});
