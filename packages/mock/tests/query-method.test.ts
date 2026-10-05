/**
 * @vitest-environment node
 *
 * A mock answering HTTP QUERY: a read that asks with a body. At the
 * collection root it lists the records, paging them as its body asks; at a
 * record's path it answers that record; and it never takes the place of the
 * GET the same path declares, nor counts as a write to the store.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { detectOperation } from "../src/auto/operation-detect";
import { trackWritesInFlight } from "../src/managed/writes-in-flight";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });
const Page = z.object({ items: z.array(User), total: z.number(), page: z.number() });

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        search: endpoint.query("").variables<{ page?: number; pageSize?: number }>().response(Page),
        list: endpoint.get("").response(z.array(User)),
        find: endpoint.query(":id").response(User),
        report: endpoint.query("report").response(z.object({ asked: z.unknown() })),
      },
    }),
  },
});

const server = createAutoMockServer({
  source: api,
  port: 0,
  log: false,
  seed: { count: 5 },
  overrides: (mock) => {
    mock("users", "report").returns((ctx) => ({ asked: ctx.variables }));
  },
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

function query(path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "QUERY",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("a QUERY to a mock", () => {
  it("lists the collection, paged as its body asks", async () => {
    const response = await query("/users", { page: 2, pageSize: 2 });

    expect(response.status).toBe(200);
    const page = (await response.json()) as z.infer<typeof Page>;
    expect(page.items.map((user) => user.id)).toEqual([3, 4]);
    expect(page).toMatchObject({ total: 5, page: 2 });
  });

  it("answers the record its path names", async () => {
    const response = await query("/users/2", {});

    expect(response.status).toBe(200);
    expect(((await response.json()) as z.infer<typeof User>).id).toBe(2);
  });

  it("hands its body to the handler as the variables", async () => {
    const response = await query("/users/report", { since: "2026-01-01", tags: ["a", "b"] });

    expect(await response.json()).toEqual({ asked: { since: "2026-01-01", tags: ["a", "b"] } });
  });

  it("leaves the GET of the same path to the endpoint that declares it", async () => {
    const response = await fetch(`${url}/users`);

    expect(Array.isArray(await response.json())).toBe(true);
  });
});

describe("how a mock reads a QUERY endpoint", () => {
  it("takes it for a list at the collection root and a lookup at a record", () => {
    expect(detectOperation("QUERY", "")).toBe("list");
    expect(detectOperation("QUERY", ":id")).toBe("get");
    expect(detectOperation("QUERY", "report")).toBe("custom");
  });

  it("does not count it as a write to the store", () => {
    const writes = trackWritesInFlight();
    writes.start("asked", "QUERY");
    writes.start("created", "POST");

    expect(writes.end("asked")).toBe(false);
    expect(writes.end("created")).toBe(true);
  });
});
