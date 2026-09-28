import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { createMockClient } from "../../src/create-mock-client";

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

async function failureOf(run: () => Promise<unknown>): Promise<[unknown, number]> {
  const start = performance.now();
  const error = await run().catch((caught: unknown) => caught);
  return [error, performance.now() - start];
}

describe("network faults on the mock client", () => {
  it("fails a timeout fault after the configured timeout", async () => {
    const mc = createMockClient<typeof api>({
      network: { errorRate: 1, faultTypes: ["timeout"], timeout: 150 },
    });
    mc.mock("users", "getAll").resolves([]);

    const [error, elapsed] = await failureOf(() => mc.client.users.getAll());

    expect(error).toBeInstanceOf(HTTPError);
    expect(error instanceof HTTPError && error.status).toBe(408);
    expect(elapsed).toBeGreaterThanOrEqual(140);
  });

  it("fails a timeout fault at once when no timeout is configured", async () => {
    const mc = createMockClient<typeof api>({ network: { errorRate: 1, faultTypes: ["timeout"] } });
    mc.mock("users", "getAll").resolves([]);

    const [error, elapsed] = await failureOf(() => mc.client.users.getAll());

    expect(error instanceof HTTPError && error.status).toBe(408);
    expect(elapsed).toBeLessThan(100);
  });
});
