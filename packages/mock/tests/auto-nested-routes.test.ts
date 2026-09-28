/**
 * Routes whose path mixes parameters with fixed segments, served by the auto
 * mock at the path they declare.
 *
 * Only the collection root and a single `:id` segment used to be served: a
 * path with a fixed segment after the parameter answered "Route not found",
 * a POST on one was classified as a create, and a lookup such as
 * `by-email/:email` read an `id` no such request carries.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { analyzeRoutes } from "../src/auto/route-analyzer";

const { endpoint } = courier();

const User = z.object({ id: z.number().int(), name: z.string(), email: z.email() });
const Order = z.object({ id: z.number().int(), total: z.number() });

function usersApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          byEmail: endpoint.get("by-email/:email").variables<{ email: string }>().response(User),
          list: endpoint.get("").response(z.array(User)),
          get: endpoint.get(":id").variables<{ id: number }>().response(User),
          orders: endpoint.get(":id/orders").variables<{ id: number }>().response(z.array(Order)),
          activate: endpoint.post(":id/activate").variables<{ id: number }>().response(User),
          stats: endpoint.get("stats").response(z.object({ count: z.number() })),
          rename: endpoint.patch("by-email/:email").variables<{ email: string; name: string }>(),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve(): Promise<string> {
  const server = createAutoMockServer({
    source: usersApi("http://placeholder.invalid"),
    port: 0,
    log: false,
    seed: { count: 4 },
  });
  running.push(server);
  return (await server.start()).url;
}

describe("route classification", () => {
  const routes = analyzeRoutes(usersApi("http://placeholder.invalid"));
  const operationOf = (name: string) => routes.find((r) => r.endpoint === name)?.operation;

  it("treats a fixed segment after the parameter as a custom route", () => {
    expect(operationOf("orders")).toBe("custom");
    expect(operationOf("activate")).toBe("custom");
  });

  it("treats fixed segments before a final parameter as a lookup of one record", () => {
    expect(operationOf("byEmail")).toBe("get");
    expect(operationOf("rename")).toBe("update");
  });
});

describe("serving mixed paths", () => {
  it("answers a path with a fixed segment after the parameter", async () => {
    const url = await serve();
    const client = createCaller(usersApi(url));

    const orders = await client.users.orders({ id: 1 });
    expect(Array.isArray(orders)).toBe(true);
    const activated = await client.users.activate({ id: 1 });
    expect(typeof activated.email).toBe("string");
  });

  it("finds a record by the field a lookup path names", async () => {
    const url = await serve();
    const client = createCaller(usersApi(url));
    const second = await client.users.get({ id: 2 });

    const found = await client.users.byEmail({ email: second.email });
    expect(found).toEqual(second);
  });

  it("updates the record a lookup path names", async () => {
    const url = await serve();
    const client = createCaller(usersApi(url));
    const third = await client.users.get({ id: 3 });

    await client.users.rename({ email: third.email, name: "Renamed" });
    expect((await client.users.get({ id: 3 })).name).toBe("Renamed");
  });

  it("finds a lookup's record through the proxy route as well", async () => {
    const url = await serve();
    const second = (await (await fetch(`${url}/users/2`)).json()) as { email: string };

    const res = await fetch(`${url}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "users", method: "byEmail", variables: { email: second.email } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(second);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const url = await serve();
    const res = await fetch(`${url}/users/1/activate`, { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
  });

  it("answers 404 for a lookup that matches no record", async () => {
    const url = await serve();
    const res = await fetch(`${url}/users/by-email/nobody@example.com`);
    expect(res.status).toBe(404);
  });

  it("still serves the fixed sub-path and the by-id route beside them", async () => {
    const url = await serve();
    expect((await fetch(`${url}/users/stats`)).status).toBe(200);
    const res = await fetch(`${url}/users/2`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: number }).id).toBe(2);
  });
});
