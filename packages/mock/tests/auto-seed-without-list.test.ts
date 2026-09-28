/**
 * Collections of groups that declare no list endpoint are seeded too.
 *
 * Seeding took its schema from a group's list endpoint only, so a group
 * without one — the Petstore's `pet`, `store` and `user` — started empty
 * whatever `seed` asked for: `GET /pet/1` answered 404 and Studio showed 0
 * records, while `findByStatus` answered freshly generated pets.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const Pet = z.object({ id: z.number().int().optional(), name: z.string(), status: z.string().optional() });
const Order = z.object({ id: z.number().int().optional(), petId: z.number().int(), quantity: z.number().int() });
const User = z.object({ id: z.number().int().optional(), username: z.string(), email: z.email() });

function petstore(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      pet: defineGroup({
        prefix: "/pet",
        endpoints: {
          addPet: endpoint.post("").variables(Pet).response(Pet),
          findPetsByStatus: endpoint.get("findByStatus").variables<{ status: string }>().response(z.array(Pet)),
          getPetById: endpoint.get(":petId").variables<{ petId: number }>().response(Pet),
        },
      }),
      store: defineGroup({
        prefix: "/store",
        endpoints: {
          getInventory: endpoint.get("inventory").response<Record<string, number>>(),
          getOrderById: endpoint.get("order/:orderId").variables<{ orderId: number }>().response(Order),
        },
      }),
      user: defineGroup({
        prefix: "/user",
        endpoints: {
          createUser: endpoint.post("").variables(User).response(User),
          getUserByName: endpoint.get(":username").variables<{ username: string }>().response(User),
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
    source: petstore("http://placeholder.invalid"),
    port: 0,
    log: false,
    studio: false,
    seed: { count: 4, user: 2 },
  });
  running.push(server);
  const { url } = await server.start();
  return { server, client: createCaller(petstore(url)) };
}

describe("seeding a group without a list endpoint", () => {
  it("seeds each collection from the schema its record endpoints answer with", async () => {
    const { server } = await serve();

    expect(server.store.collection("pet").count()).toBe(4);
    expect(server.store.collection("store").count()).toBe(4);
    expect(server.store.collection("user").count()).toBe(2);
  });

  it("serves the seeded records by id and by lookup", async () => {
    const { server, client } = await serve();

    expect((await client.pet.getPetById({ petId: 1 })).id).toBe(1);
    expect((await client.store.getOrderById({ orderId: 3 })).id).toBe(3);
    const [first] = server.store.collection("user").getAll();
    const username = String(first?.username);
    expect((await client.user.getUserByName({ username })).username).toBe(username);
  });

  it("leaves a group with no record schema empty", async () => {
    const api = defineApi({
      baseURL: "http://placeholder.invalid",
      groups: {
        health: defineGroup({ prefix: "/health", endpoints: { ping: endpoint.get("ping") } }),
      },
    });
    const server = createAutoMockServer({ source: api, port: 0, log: false, studio: false });
    running.push(server);

    expect(server.store.collection("health").count()).toBe(0);
  });
});
