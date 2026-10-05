/**
 * @vitest-environment node
 *
 * A mock of a source whose groups hold groups, called by a client pointed
 * at it: every call reaches the mock at the address the client builds —
 * each group's prefix in order — and is answered by the endpoint it names,
 * from a collection of its own, overridden by its group's path. A group
 * without a prefix of its own is served at the paths its endpoints declare,
 * where its client calls them.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { getSourceGroupNames } from "../src/auto/route-analyzer";

const { endpoint } = courier();
const Invoice = z.object({ id: z.number(), total: z.number() });

function api(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      billing: defineGroup({
        prefix: "billing",
        endpoints: { summary: endpoint.get("summary").response(z.object({ total: z.number() })) },
        groups: {
          invoices: defineGroup({
            prefix: "invoices",
            endpoints: {
              list: endpoint.get("").response(z.array(Invoice)),
              byId: endpoint.get(":id").variables<{ id: number }>().response(Invoice),
              create: endpoint.post("").variables<{ total: number }>().response(Invoice),
            },
          }),
        },
      }),
      status: defineGroup({
        endpoints: { ping: endpoint.get("health/ping").response(z.object({ ok: z.boolean() })) },
      }),
    },
  });
}

const server = createAutoMockServer({
  source: api("http://placeholder.invalid"),
  port: 0,
  log: false,
  seed: { count: 3, "billing.invoices": 5 },
  overrides: (mock) => {
    mock("billing", "summary").resolves({ total: 42 });
    mock("status", "ping").resolves({ ok: true });
  },
});

const clientAt = (url: string) => createCaller(api(url));

let client: ReturnType<typeof clientAt>;
beforeAll(async () => {
  const { url } = await server.start();
  client = clientAt(url);
});
afterAll(async () => {
  await server.stop();
});

describe("a mock of groups inside groups", () => {
  it("answers a group inside a group at the address its client calls, seeded by its path", async () => {
    const invoices = await client.billing.invoices.list();

    expect(invoices).toHaveLength(5);
    await expect(client.billing.invoices.byId({ id: 2 })).resolves.toMatchObject({ id: 2 });
  });

  it("keeps the outer group's own endpoints apart from the group inside it", async () => {
    await expect(client.billing.summary()).resolves.toEqual({ total: 42 });
  });

  it("stores a group inside a group's records in a collection of its own", async () => {
    const created = await client.billing.invoices.create({ total: 9 });

    expect(server.store.collection("billing.invoices").getById(created.id)).toMatchObject({
      total: 9,
    });
  });

  it("serves a group without a prefix at the paths its endpoints declare", async () => {
    await expect(client.status.ping()).resolves.toEqual({ ok: true });
  });

  it("names every group by its path", () => {
    expect([...getSourceGroupNames(api("https://api.example"))]).toEqual([
      "billing",
      "billing.invoices",
      "status",
    ]);
  });
});
