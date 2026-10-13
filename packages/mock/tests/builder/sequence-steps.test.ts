import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockClient } from "../../src/create-mock-client";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

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

/* Long enough that the entry after it, held to half of it, is told apart
   from one that waited it, however slow a moment the machine has. */
const ENTRY_DELAY = 1_000;

async function timed<TResult>(run: () => Promise<TResult>): Promise<[TResult, number]> {
  const start = performance.now();
  const result = await run();
  return [result, performance.now() - start];
}

describe("sequence entries on the mock client", () => {
  it("answers with the status an entry declares", async () => {
    const mc = createMockClient<typeof api>();
    mc.mock("users", "getAll").sequence([{ data: ["a"], status: 201 }, ["b"]]);

    await mc.client.users.getAll();
    await mc.client.users.getAll();

    expect(mc.history.map((entry) => entry.result?.status)).toEqual([201, 200]);
  });

  it("waits the delay an entry declares, for that entry alone", async () => {
    const mc = createMockClient<typeof api>();
    mc.mock("users", "getAll").sequence([{ data: ["a"], delay: ENTRY_DELAY }, ["b"]]);

    const [first, firstMs] = await timed(() => mc.client.users.getAll());
    const [second, secondMs] = await timed(() => mc.client.users.getAll());

    expect(first).toEqual(["a"]);
    expect(firstMs).toBeGreaterThanOrEqual(ENTRY_DELAY - 10);
    expect(second).toEqual(["b"]);
    expect(secondMs).toBeLessThan(ENTRY_DELAY / 2);
  });

  it("gives each of two concurrent calls the status of its own entry", async () => {
    const mc = createMockClient<typeof api>();
    mc.mock("users", "getAll").sequence([
      { data: ["slow"], status: 201, delay: 80 },
      { data: ["fast"], status: 202 },
    ]);

    const results = await Promise.all([mc.client.users.getAll(), mc.client.users.getAll()]);

    expect(results).toEqual([["slow"], ["fast"]]);
    const byData = new Map(
      mc.history.map((entry) => [JSON.stringify(entry.result?.data), entry.result?.status]),
    );
    expect(byData.get('["slow"]')).toBe(201);
    expect(byData.get('["fast"]')).toBe(202);
  });

  it("answers an error entry as an error on the call it is reached", async () => {
    const mc = createMockClient<typeof api>();
    mc.mock("users", "getAll").sequence([["a"], { error: true, status: 503 }, ["c"]]);

    const outcomes: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      outcomes.push(
        await mc.client.users.getAll().then(
          (data) => data,
          (error: unknown) => (error instanceof HTTPError ? error.status : error),
        ),
      );
    }

    expect(outcomes).toEqual([["a"], 503, ["c"], ["c"]]);
  });

  it("keeps a status set with withStatus for entries that declare none", async () => {
    const mc = createMockClient<typeof api>();
    mc.mock("users", "getAll")
      .withStatus(202)
      .sequence([["a"], { data: ["b"], status: 201 }]);

    await mc.client.users.getAll();
    await mc.client.users.getAll();

    expect(mc.history.map((entry) => entry.result?.status)).toEqual([202, 201]);
  });
});

describe("sequence entries on the mock server", () => {
  let server: MockServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = createMockServer({ port: 0, log: false });
    server
      .mock("users", "getAll")
      .sequence([{ data: ["a"], status: 201, delay: ENTRY_DELAY }, ["b"]]);
    baseUrl = (await server.start()).url;
  });

  afterAll(async () => {
    await server.stop();
  });

  function request(): Promise<Response> {
    return fetch(`${baseUrl}/api/request?_s=api&_g=users&_m=getAll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  it("answers with each entry's status and delay", async () => {
    const [first, firstMs] = await timed(request);
    const [second, secondMs] = await timed(request);

    expect(first.status).toBe(201);
    expect(await first.json()).toEqual(["a"]);
    expect(firstMs).toBeGreaterThanOrEqual(ENTRY_DELAY - 10);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(["b"]);
    expect(secondMs).toBeLessThan(ENTRY_DELAY / 2);
  });
});
