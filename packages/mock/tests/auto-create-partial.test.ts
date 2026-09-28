/**
 * An auto create given only some fields answers a whole record.
 *
 * A non-empty body was stored exactly as given, so `create({ name })`
 * answered `{ name, id }` and a typed client rejected it for every field
 * the schema requires and the body left out.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const User = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.email(),
  role: z.enum(["admin", "member"]).default("member"),
});
const Pet = z.object({ petId: z.uuid(), name: z.string(), price: z.number().int().positive() });

function shopApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          list: endpoint.get("").response(z.array(User)),
          create: endpoint.post("").variables<Partial<z.infer<typeof User>>>().response(User),
        },
      }),
      pets: defineGroup({
        prefix: "pets",
        endpoints: {
          list: endpoint.get("").response(z.array(Pet)),
          get: endpoint.get(":petId").variables<{ petId: string }>().response(Pet),
          create: endpoint.post("").variables<Partial<z.infer<typeof Pet>>>().response(Pet),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function client() {
  const server = createAutoMockServer({
    source: shopApi("http://placeholder.invalid"),
    port: 0,
    log: false,
    seed: { count: 3 },
  });
  running.push(server);
  return createCaller(shopApi((await server.start()).url));
}

describe("an auto create with a partial body", () => {
  it("answers a whole record, keeping the fields it was given", async () => {
    const api = await client();

    const created = await api.users.create({ name: "Typed" });

    expect(created.name).toBe("Typed");
    expect(created.id).toBe(4);
    expect(created.email).toMatch(/@/);
    expect(created.role).toBe("member");
  });

  it("stores the whole record, so the list answers it too", async () => {
    const api = await client();
    await api.users.create({ name: "Typed" });

    const users = await api.users.list();
    expect(users.at(-1)).toMatchObject({ id: 4, name: "Typed" });
  });

  it("keys a record of a collection with generated keys by a key of the declared format", async () => {
    const api = await client();

    const created = await api.pets.create({ name: "Rex" });

    expect(created.petId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    expect(await api.pets.get({ petId: created.petId })).toEqual(created);
  });
});
