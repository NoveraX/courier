import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineApi, defineGroup, endpoint } from "@noverax/courier/define";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const ItemSchema = z.object({ id: z.string(), name: z.string(), price: z.number() });

const api = defineApi({
  baseURL: "https://test.api",
  groups: {
    items: defineGroup({
      prefix: "/items",
      endpoints: {
        list: endpoint({ response: z.array(ItemSchema), type: "query" })((http) => http.get("")),
        get: endpoint({ response: ItemSchema, type: "query" })((http, v) => http.get(":itemId", v)),
        create: endpoint({
          response: ItemSchema,
          variables: z.object({ name: z.string(), price: z.number() }),
          type: "mutation",
        })((http, v) => http.post("", v)),
        update: endpoint({ response: ItemSchema, type: "mutation" })((http, v) =>
          http.patch(":itemId", v),
        ),
        replace: endpoint({ response: ItemSchema, type: "mutation" })((http, v) =>
          http.put(":itemId", v),
        ),
        delete: endpoint({ type: "mutation" })((http, v) => http.del(":itemId", v)),
      },
    }),
  },
});

// ── Override + builder features ──────────────────────────────────────────────

describe("auto-mock overrides & builder", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 5 },
    overrides: (mock) => {
      // Decorator: withHeaders on auto-CRUD
      mock("items", "list").withHeaders({ "X-Count": "5" });

      // Decorator: withStatus on auto-CRUD
      mock("items", "list").withStatus(206);

      // Custom handler + named param
      mock("items", "get").returns((ctx) => {
        const vars = ctx.variables as Record<string, unknown>;
        return { id: vars.itemId as string, name: "Custom", price: 0 };
      });

      // Conditional error
      mock("items", "delete").returns((ctx) => {
        const vars = ctx.variables as Record<string, unknown>;
        if (vars.itemId === "id-1") throw new Error("Protected");
        return { deleted: true };
      });
    },
  });

  let url: string;

  beforeAll(async () => {
    const info = await server.start();
    url = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("decorator withHeaders preserves auto-CRUD data", async () => {
    const res = await fetch(`${url}/items`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(5);
    expect(res.headers.get("x-count")).toBe("5");
  });

  it("decorator withStatus applies custom status code", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.status).toBe(206);
  });

  it("custom handler receives named param (itemId)", async () => {
    const body = await fetch(`${url}/items/abc-123`).then((r) => r.json());
    expect(body).toEqual({ id: "abc-123", name: "Custom", price: 0 });
  });

  it("conditional error on delete", async () => {
    const blocked = await fetch(`${url}/items/id-1`, { method: "DELETE" });
    expect(blocked.status).toBe(500);
    expect(await blocked.json()).toEqual({ error: "Protected" });

    const allowed = await fetch(`${url}/items/id-2`, { method: "DELETE" });
    expect(allowed.status).toBe(200);
  });

  it("PUT routes to replace/update endpoint", async () => {
    const res = await fetch(`${url}/items/id-3`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", price: 99 }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH routes to update endpoint", async () => {
    const res = await fetch(`${url}/items/id-3`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 42 }),
    });
    expect(res.status).toBe(200);
  });
});

// ── Builder advanced: once, times, sequence, rejects, callIndex ──────────────

describe("builder advanced features", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 3 },
    overrides: (mock) => {
      // .once() — first call returns special, then falls back to auto-CRUD
      mock("items", "list").resolves([{ id: "special", name: "Once", price: 0 }]).once();

      // .rejects() with custom status
      mock("items", "create").rejects(422, { message: "Validation failed" });

      // .sequence() — ordered responses
      mock("items", "get").sequence([
        { id: "seq-1", name: "First", price: 1 },
        { id: "seq-2", name: "Second", price: 2 },
        { id: "seq-3", name: "Last", price: 3 },
      ]);
    },
  });

  let url: string;

  beforeAll(async () => {
    const info = await server.start();
    url = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  it(".once() returns special data on first call, then falls back", async () => {
    const first = await fetch(`${url}/items`).then((r) => r.json());
    expect(first).toEqual([{ id: "special", name: "Once", price: 0 }]);

    // Second call → auto-CRUD (seeded data)
    const second = await fetch(`${url}/items`).then((r) => r.json());
    expect(second.length).toBe(3);
    expect(second[0].id).not.toBe("special");
  });

  it(".rejects() returns error with custom status", async () => {
    const res = await fetch(`${url}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", price: 10 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toEqual({ message: "Validation failed" });
  });

  it(".sequence() returns ordered responses", async () => {
    const r1 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r1.name).toBe("First");

    const r2 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r2.name).toBe("Second");

    const r3 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r3.name).toBe("Last");

    // Beyond sequence length → sticks on last
    const r4 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r4.name).toBe("Last");
  });
});

// ── State machine: inState / transitionTo ───────────────────────────────────

describe("state machine (inState/transitionTo)", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 0 },
    overrides: (mock) => {
      // Default state "Started" → unauthorized
      mock("items", "list")
        .inState("Started")
        .rejects(401, { message: "Unauthorized" });

      // After login → success
      mock("items", "list")
        .inState("logged-in")
        .resolves([{ id: "1", name: "Visible", price: 10 }]);

      // Login action transitions state
      mock("items", "create")
        .inState("Started")
        .resolves({ id: "token", name: "session", price: 0 })
        .transitionTo("logged-in");
    },
  });

  let url: string;

  beforeAll(async () => {
    const info = await server.start();
    url = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("rejects in initial state", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.status).toBe(401);
  });

  it("transitions state on action", async () => {
    const login = await fetch(`${url}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "login", price: 0 }),
    });
    expect(login.status).toBe(200);
  });

  it("succeeds after state transition", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: "1", name: "Visible", price: 10 }]);
  });
});

// ── Named latency profiles ──────────────────────────────────────────────────

describe("named latency profiles", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 1 },
    overrides: (mock) => {
      mock("items", "list").withLatency("3g"); // 200-600ms
      mock("items", "get").withLatency("fiber"); // 1-5ms
    },
  });

  let url: string;
  beforeAll(async () => { url = (await server.start()).url; });
  afterAll(async () => { await server.stop(); });

  it("3g profile adds significant latency", async () => {
    const start = performance.now();
    await fetch(`${url}/items`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100); // 3g min=200, but allow margin
  });

  it("fiber profile is fast", async () => {
    const start = performance.now();
    await fetch(`${url}/items/id-1`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200); // fiber max=5ms + overhead
  });
});

// ── .rejects() without data ─────────────────────────────────────────────────

describe(".rejects() without data arg", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 0 },
    overrides: (mock) => {
      mock("items", "list").rejects(418); // no data, just status
    },
  });

  let url: string;
  beforeAll(async () => { url = (await server.start()).url; });
  afterAll(async () => { await server.stop(); });

  it("returns custom status with default error body", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body.error).toHaveProperty("message");
  });
});

// ── Query params routing ────────────────────────────────────────────────────

describe("query params routing", () => {
  const apiWithFilters = defineApi({
    baseURL: "https://test.api",
    groups: {
      products: defineGroup({
        prefix: "/products",
        endpoints: {
          list: endpoint({ response: z.array(ItemSchema), type: "query" })((http) =>
            http.get(""),
          ),
          getByCategory: endpoint({ response: z.array(ItemSchema), type: "query" })((http, v) =>
            http.get("", v),
          ),
        },
      }),
    },
  });

  const server = createAutoMockServer({
    source: apiWithFilters,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 5 },
    overrides: (mock) => {
      mock("products", "getByCategory").returns((ctx) => {
        const vars = ctx.variables as Record<string, unknown>;
        return [{ id: "filtered", name: `cat-${vars.category}`, price: 0 }];
      });
    },
  });

  let url: string;
  beforeAll(async () => { url = (await server.start()).url; });
  afterAll(async () => { await server.stop(); });

  it("routes GET with query params to getBy* endpoint", async () => {
    const body = await fetch(`${url}/products?category=food`).then((r) => r.json());
    expect(body[0].name).toBe("cat-food");
  });
});
