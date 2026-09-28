/**
 * Top-level endpoints whose path starts with a slash are served where a
 * direct client calls them.
 *
 * The collection was the path's first segment, which is empty for
 * `"/orders"`, so the endpoint fell back to its own name and was mounted at
 * `/listOrders/orders`; the client, calling `/orders`, got 404.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { analyzeRoutes } from "../src/auto/route-analyzer";

const { endpoint } = courier();
const Order = z.object({ id: z.number().int(), total: z.number() });

function shopApi(baseURL: string) {
  return defineApi({
    baseURL,
    endpoints: {
      listOrders: endpoint.get("/orders").response(z.array(Order)),
      getOrder: endpoint.get("/orders/:id").variables<{ id: number }>().response(Order),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

describe("a top-level endpoint with a leading slash", () => {
  it("is analyzed at the path it declares, in the collection it names", () => {
    const routes = analyzeRoutes(shopApi("http://placeholder.invalid"));
    expect(routes.map((r) => [r.group, r.endpoint, r.fullPath, r.operation])).toEqual([
      ["orders", "listOrders", "/orders", "list"],
      ["orders", "getOrder", "/orders/:id", "get"],
    ]);
  });

  it("is served where a direct client calls it", async () => {
    const server = createAutoMockServer({
      source: shopApi("http://placeholder.invalid"),
      port: 0,
      log: false,
      studio: false,
      seed: { count: 3 },
    });
    running.push(server);
    const client = createCaller(shopApi((await server.start()).url));

    const orders = await client.listOrders();
    expect(orders).toHaveLength(3);
    expect(await client.getOrder({ id: 2 })).toEqual(orders[1]);
  });
});

describe("a grouped endpoint with a leading slash", () => {
  it("names its record by the parameter it declares", () => {
    const api = defineApi({
      baseURL: "http://placeholder.invalid",
      groups: {
        pets: defineGroup({
          prefix: "pets",
          endpoints: { get: endpoint.get("/:petId").variables<{ petId: string }>() },
        }),
      },
    });

    const [route] = analyzeRoutes(api);
    expect(route).toMatchObject({ path: ":petId", fullPath: "/pets/:petId", idParam: "petId" });
  });
});
