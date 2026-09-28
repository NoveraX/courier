/**
 * An endpoint that is none of its collection's operations — an inventory, a
 * login, a logout — is answered too: with a value its response schema
 * describes, whatever its type, or with nothing when it has no schema. A
 * schema that was not an object, and no schema at all, answered 404 "No
 * mock", as the Petstore's getInventory, loginUser and logoutUser did.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

function storeApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      store: defineGroup({
        prefix: "/store",
        endpoints: {
          getInventory: endpoint.get("inventory").response(z.record(z.string(), z.number().int())),
          loginUser: endpoint.get("login").variables<{ username: string }>().response(z.string()),
          listTags: endpoint.get("tags").response(z.array(z.string())),
          logoutUser: endpoint.get("logout"),
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
  const server = createAutoMockServer({ source: storeApi("http://placeholder.invalid"), port: 0, log: false });
  running.push(server);
  const { url } = await server.start();
  return createCaller(storeApi(url));
}

describe("an endpoint that is none of its collection's operations", () => {
  it("answers a map, a string and a list its schema describes", async () => {
    const api = await client();

    const inventory = await api.store.getInventory();
    const token = await api.store.loginUser({ username: "ada" });
    const tags = await api.store.listTags();

    expect(Object.keys(inventory).length).toBeGreaterThan(0);
    expect(Object.values(inventory).every((count) => Number.isInteger(count))).toBe(true);
    expect(typeof token).toBe("string");
    expect(tags).toHaveLength(5);
    expect(tags.every((tag) => typeof tag === "string")).toBe(true);
  });

  it("answers with nothing when it declares no answer", async () => {
    const api = await client();

    await expect(api.store.logoutUser()).resolves.toBeNull();
  });
});
