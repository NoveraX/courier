/**
 * Collections keyed by a field other than `id`.
 *
 * Seeding forced every collection's key to `id`, so records with a `petId`
 * and no `id` could never be read by id, and a key set in `overrides` was
 * put back to `id` by every reset and reseed.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AutoMockServerConfig } from "../src/auto/create-auto-server";
import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const Pet = z.object({ petId: z.uuid(), name: z.string() });
const PetPage = z.object({ items: z.array(Pet), total: z.number() });
const Tag = z.object({ slug: z.string(), label: z.string() });

function shopApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      pets: defineGroup({
        prefix: "pets",
        endpoints: {
          list: endpoint.get("").response(PetPage),
          get: endpoint.get(":petId").variables<{ petId: string }>().response(Pet),
          remove: endpoint.del(":petId").variables<{ petId: string }>(),
        },
      }),
      tags: defineGroup({
        prefix: "tags",
        endpoints: {
          list: endpoint.get("").response(z.array(Tag)),
          get: endpoint.get(":id").variables<{ id: string }>().response(Tag),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve(overrides?: AutoMockServerConfig["overrides"]): Promise<string> {
  const server = createAutoMockServer({
    source: shopApi("http://placeholder.invalid"),
    port: 0,
    log: false,
    studio: false,
    seed: { count: 3 },
    ...(overrides && { overrides }),
  });
  running.push(server);
  return (await server.start()).url;
}

async function firstPet(url: string): Promise<z.infer<typeof Pet>> {
  const page = (await (await fetch(`${url}/pets`)).json()) as z.infer<typeof PetPage>;
  const pet = page.items[0];
  if (!pet) throw new Error("no seeded pet");
  return pet;
}

describe("a collection keyed by its route's parameter", () => {
  it("reads a record by that key over the REST path and the typed client", async () => {
    const url = await serve();
    const pet = await firstPet(url);

    const res = await fetch(`${url}/pets/${pet.petId}`);
    expect(res.status).toBe(200);
    const client = createCaller(shopApi(url));
    expect(await client.pets.get({ petId: pet.petId })).toEqual(pet);
  });

  it("reads a record by that key over the proxy route", async () => {
    const url = await serve();
    const pet = await firstPet(url);

    const res = await fetch(`${url}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "pets", method: "get", variables: { petId: pet.petId } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pet);
  });

  it("deletes by that key without adding an id field", async () => {
    const url = await serve();
    const pet = await firstPet(url);

    expect((await fetch(`${url}/pets/${pet.petId}`, { method: "DELETE" })).status).toBe(200);
    expect((await fetch(`${url}/pets/${pet.petId}`)).status).toBe(404);
    const page = (await (await fetch(`${url}/pets`)).json()) as { items: object[] };
    expect(page.items.every((item) => !("id" in item))).toBe(true);
  });
});

describe("a key set in overrides", () => {
  const keyTagsBySlug: AutoMockServerConfig["overrides"] = (_mock, store) => {
    store.collection("tags", { idField: "slug" });
  };

  it("survives /__admin/reset", async () => {
    const url = await serve(keyTagsBySlug);
    await fetch(`${url}/__admin/reset`, { method: "POST" });

    const tags = (await (await fetch(`${url}/tags`)).json()) as Array<{ slug: string }>;
    const res = await fetch(`${url}/tags/${encodeURIComponent(tags[0]?.slug ?? "")}`);
    expect(res.status).toBe(200);
  });

  it("is kept across repeated resets", async () => {
    const url = await serve(keyTagsBySlug);
    const tags = (await (await fetch(`${url}/tags`)).json()) as Array<{ slug: string }>;

    const before = await fetch(`${url}/tags/${encodeURIComponent(tags[1]?.slug ?? "")}`);
    expect(before.status).toBe(200);
    await fetch(`${url}/__admin/reset`, { method: "POST" });
    await fetch(`${url}/__admin/reset`, { method: "POST" });
    const after = await fetch(`${url}/tags/${encodeURIComponent(tags[1]?.slug ?? "")}`);
    expect(after.status).toBe(200);
  });
});
