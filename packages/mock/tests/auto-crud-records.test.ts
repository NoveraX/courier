/**
 * The auto-CRUD routes over HTTP, held to what a real REST API does.
 *
 * A create after any delete repeated an existing id, and the new record hid
 * behind the old one; records keyed "1" or "007" answered 404 on every by-id
 * route; PUT merged like PATCH; and a list endpoint declaring a pagination
 * wrapper answered a bare array its own schema refused.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();
const Todo = z.object({ id: z.number(), title: z.string(), done: z.boolean() });

const running: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve(
  api: Parameters<typeof createAutoMockServer>[0]["source"],
  overrides?: Parameters<typeof createAutoMockServer>[0]["overrides"],
): Promise<string> {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 3 },
    ...(overrides && { overrides }),
  });
  running.push(server);
  return (await server.start()).url;
}

function todosApi() {
  return defineApi({
    baseURL: "https://api.example",
    groups: {
      todos: defineGroup({
        prefix: "/todos",
        endpoints: {
          list: endpoint.get("").response(z.array(Todo)),
          get: endpoint.get(":id").response(Todo),
          create: endpoint.post("").response(Todo),
          replace: endpoint.put(":id").response(Todo),
          remove: endpoint.del(":id"),
        },
      }),
    },
  });
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("auto-CRUD records", () => {
  it("gives a created record an id no other record holds, after a delete", async () => {
    const url = await serve(todosApi());
    await fetch(`${url}/todos/2`, { method: "DELETE" });

    const created = await fetch(`${url}/todos`, json({ title: "New", done: false })).then((r) =>
      r.json(),
    );
    const read = await fetch(`${url}/todos/${created.id}`).then((r) => r.json());

    expect(created.id).toBe(4);
    expect(read.title).toBe("New");
  });

  it("refuses a create that names an id already taken", async () => {
    const url = await serve(todosApi());

    const response = await fetch(`${url}/todos`, json({ id: 1, title: "Dup", done: false }));

    expect(response.status).toBe(409);
  });

  it("replaces the record on PUT, dropping the fields the body leaves out", async () => {
    const url = await serve(todosApi());

    const replaced = await fetch(`${url}/todos/1`, {
      ...json({ title: "Only" }),
      method: "PUT",
    }).then((r) => r.json());

    expect(replaced).toEqual({ id: 1, title: "Only" });
  });

  it("reaches records whose ids are digit strings", async () => {
    const url = await serve(todosApi(), (_mock, store) => {
      store.collection("todos").seed([{ id: "007", title: "Bond", done: false }]);
    });

    const response = await fetch(`${url}/todos/007`);

    expect(response.status).toBe(200);
    expect((await response.json()).title).toBe("Bond");
  });
});

describe("a list endpoint declaring a pagination wrapper", () => {
  const Page = z.object({ items: z.array(Todo), total: z.number(), page: z.number() });

  function pagedApi() {
    return defineApi({
      baseURL: "https://api.example",
      groups: {
        todos: defineGroup({
          prefix: "/todos",
          endpoints: { list: endpoint.get("").response(Page) },
        }),
      },
    });
  }

  it("answers in the wrapper, with the count it declares", async () => {
    const url = await serve(pagedApi());

    const body = await fetch(`${url}/todos`).then((r) => r.json());

    expect(Page.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ total: 3, page: 1 });
    expect(body.items).toHaveLength(3);
  });

  it("answers the page asked for", async () => {
    const url = await serve(pagedApi());

    const body = await fetch(`${url}/todos?page=2&pageSize=2`).then((r) => r.json());

    expect(body).toMatchObject({ total: 3, page: 2 });
    expect(body.items).toHaveLength(1);
  });
});
