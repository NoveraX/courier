/**
 * The built-in scenarios keep each endpoint's declared response shape.
 *
 * `empty` answered every list endpoint with `[]` and `slow-network` with a
 * bare array of the whole collection, so a list declaring a pagination
 * wrapper broke its own schema and a typed client rejected it. And
 * `slow-network` slowed only the lists, though it says it slows every read.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const Pet = z.object({ id: z.number().int(), name: z.string() });
const PetPage = z.object({
  items: z.array(Pet),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  hasMore: z.boolean(),
});

function petsApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      pets: defineGroup({
        prefix: "pets",
        endpoints: {
          list: endpoint.get("").variables<{ page?: number; pageSize?: number }>().response(PetPage),
          get: endpoint.get(":id").variables<{ id: number }>().response(Pet),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve() {
  const server = createAutoMockServer({
    source: petsApi("http://placeholder.invalid"),
    port: 0,
    log: false,
    seed: { count: 4 },
  });
  running.push(server);
  const { url } = await server.start();
  const apply = async (name: string) => {
    const scenario = server.scenarios[name];
    if (!scenario) throw new Error(`no scenario ${name}`);
    server.applyScenario(scenario);
  };
  return { client: createCaller(petsApi(url)), apply };
}

describe("the empty scenario", () => {
  it("answers a paginated list with an empty page in its declared shape", async () => {
    const { client, apply } = await serve();
    await apply("empty");

    expect(await client.pets.list()).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 0,
      hasMore: false,
    });
  });
});

describe("the slow-network scenario", () => {
  it("keeps a paginated list's declared shape and its records", async () => {
    const { client, apply } = await serve();
    await apply("slow-network");

    const page = await client.pets.list({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page).toMatchObject({ total: 4, page: 1, pageSize: 2, hasMore: true });
  }, 15_000);

  it("slows every read endpoint, not only the lists", async () => {
    const { client, apply } = await serve();
    await apply("slow-network");

    const started = performance.now();
    const pet = await client.pets.get({ id: 2 });
    expect(pet.id).toBe(2);
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
  }, 15_000);
});
