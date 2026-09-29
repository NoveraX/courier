import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const ItemSchema = z.object({ id: z.string(), name: z.string(), price: z.number() });

const api = defineApi({
  baseURL: "https://test.api",
  groups: {
    items: defineGroup({
      prefix: "/items",
      endpoints: {
        list: endpoint.get("").response(z.array(ItemSchema)),
        get: endpoint.get(":id").response(ItemSchema),
        create: endpoint
          .post("")
          .variables(z.object({ name: z.string(), price: z.number() }))
          .response(ItemSchema),
        delete: endpoint.del(":id"),
        deleteAll: endpoint.del(""),
      },
    }),
  },
});

// ── withLatency profiles ────────────────────────────────────────────────────

describe("withLatency profiles", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 2 },
    overrides: (mock) => {
      mock("items", "get").withLatency({ min: 80, max: 120, jitter: 10 });
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("applies custom latency profile with min/max/jitter", async () => {
    const start = performance.now();
    const res = await fetch(`${url}/items/id-1`);
    const elapsed = performance.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(60); // min - jitter margin
  });
});

// ── sequence with {data, status, delay} objects ─────────────────────────────

describe("sequence with status objects", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 0 },
    overrides: (mock) => {
      mock("items", "get").sequence([
        { data: { id: "1", name: "Ok", price: 10 }, status: 200 },
        { data: { id: "2", name: "Created", price: 20 }, status: 201 },
        { id: "3", name: "Plain", price: 30 }, // plain value (no wrapper)
      ]);
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("returns data from sequence objects", async () => {
    const r1 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r1.name).toBe("Ok");

    const r2 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r2.name).toBe("Created");

    const r3 = await fetch(`${url}/items/x`).then((r) => r.json());
    expect(r3.name).toBe("Plain");
  });
});

// ── Built-in preset scenarios ───────────────────────────────────────────────

describe("built-in preset scenarios", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 5 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("happy-path returns seeded data", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toHaveLength(5);
  });

  it("empty scenario returns empty arrays", () => {
    server.applyScenario({
      name: "empty",
      apply(mock) {
        (mock as any)("items", "list").resolves([]);
      },
    });
  });

  it("returns empty after empty scenario", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toEqual([]);
  });

  it("server-error scenario returns 5xx", () => {
    server.applyScenario({
      name: "server-error",
      apply(mock) {
        (mock as any)("items", "list").rejects(503, { message: "Service unavailable" });
      },
    });
  });

  it("returns 503 after error scenario", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.status).toBe(503);
  });
});

// ── REST route /api/:group/:method ──────────────────────────────────────────

describe("REST route /api/:group/:method", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 3 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("GET /api/items/list returns data", async () => {
    const res = await fetch(`${url}/api/items/list`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
  });

  it("POST /api/items/get with variables", async () => {
    const res = await fetch(`${url}/api/items/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "id-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("id-1");
  });
});

// ── server.mock() after start (dynamic registration) ────────────────────────

describe("dynamic mock registration after start", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 3 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("auto-CRUD works initially", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toHaveLength(3);
  });

  it("overrides dynamically after start", async () => {
    server.mock("items", "list").resolves([{ id: "dyn", name: "Dynamic", price: 0 }]);

    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toEqual([{ id: "dyn", name: "Dynamic", price: 0 }]);
  });
});

// ── Admin API (full) ────────────────────────────────────────────────────────

describe("admin API (/__admin/)", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    admin: true,
    seed: { count: 3 },
    scenarios: {
      empty: {
        name: "empty",
        apply: (mock) => {
          (mock as any)("items", "list").resolves([]);
        },
      },
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("GET /__admin/health returns status + counts", async () => {
    const body = await fetch(`${url}/__admin/health`).then((r) => r.json());
    expect(body.status).toBe("ok");
    expect(body.collections).toBeGreaterThan(0);
    expect(typeof body.mocks).toBe("number");
  });

  it("GET /__admin/mocks lists registered mocks", async () => {
    const body = await fetch(`${url}/__admin/mocks`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("group");
    expect(body[0]).toHaveProperty("method");
  });

  it("GET /__admin/scenarios lists available scenarios", async () => {
    const body = await fetch(`${url}/__admin/scenarios`).then((r) => r.json());
    expect(body.scenarios).toContain("empty");
    expect(body.scenarios).toContain("happy-path");
  });

  it("POST /__admin/scenarios/:name switches scenario", async () => {
    const res = await fetch(`${url}/__admin/scenarios/empty`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe("empty");

    // Verify the scenario took effect
    const items = await fetch(`${url}/items`).then((r) => r.json());
    expect(items).toEqual([]);
  });

  it("POST /__admin/scenarios/:unknown returns 404", async () => {
    const res = await fetch(`${url}/__admin/scenarios/nonexistent`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("GET /__admin/store lists collections", async () => {
    const body = await fetch(`${url}/__admin/store`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
    expect(body).toContain("items");
  });

  it("GET /__admin/store/:collection returns records", async () => {
    const body = await fetch(`${url}/__admin/store/items`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /__admin/store/:unknown returns 404", async () => {
    const res = await fetch(`${url}/__admin/store/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("GET /__admin/history tracks requests", async () => {
    await fetch(`${url}/items`);
    const body = await fetch(`${url}/__admin/history`).then((r) => r.json());
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("group");
    expect(body[0]).toHaveProperty("duration");
    expect(body[0]).toHaveProperty("timestamp");
  });

  it("POST /__admin/reset clears everything", async () => {
    await fetch(`${url}/__admin/reset`, { method: "POST" });
    const history = await fetch(`${url}/__admin/history`).then((r) => r.json());
    expect(history).toHaveLength(0);
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────────

describe("CORS headers", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    cors: true,
    seed: { count: 1 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("includes access-control-allow-origin header", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("handles OPTIONS preflight", async () => {
    const res = await fetch(`${url}/items`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBeLessThan(400);
  });
});

// ── Network global config ───────────────────────────────────────────────────

describe("network global latency", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 1 },
    network: { latency: { min: 50, max: 80 } },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("applies global latency to all requests", async () => {
    const start = performance.now();
    await fetch(`${url}/items`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe("network errorRate 100%", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 1 },
    network: { errorRate: 1.0 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("all requests fail when errorRate is 1.0", async () => {
    const res = await fetch(`${url}/items`);
    // The default faults are 500 and 503
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ── DELETE /prefix (deleteAll) ──────────────────────────────────────────────

describe("DELETE /prefix (deleteAll)", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 5 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("has seeded data initially", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toHaveLength(5);
  });

  it("DELETE /items (no id) clears all records", async () => {
    const res = await fetch(`${url}/items`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(5);
  });

  it("collection is empty after deleteAll", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toHaveLength(0);
  });
});

// ── Top-level endpoints (no group) ──────────────────────────────────────────

describe("top-level endpoints (no group)", () => {
  const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

  const flatApi = defineApi({
    baseURL: "https://test.api",
    endpoints: {
      listUsers: endpoint.get("users").response(z.array(UserSchema)),
      getUser: endpoint.get("users/:id").response(UserSchema),
      healthCheck: endpoint.get("health").response(z.object({ ok: z.boolean() })),
    },
  });

  const server = createAutoMockServer({
    source: flatApi,
    port: 0,
    log: false,
    seed: { count: 5 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("GET /users returns seeded list", async () => {
    const body = await fetch(`${url}/users`).then((r) => r.json());
    expect(body).toHaveLength(5);
    expect(body[0]).toHaveProperty("email");
  });

  it("GET /users/:id returns single record", async () => {
    const body = await fetch(`${url}/users/id-1`).then((r) => r.json());
    expect(body.id).toBe("id-1");
  });

  it("GET /health returns seeded data (separate group derived from path)", async () => {
    const body = await fetch(`${url}/health`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("ok");
  });
});

// ── Mixed: groups + top-level endpoints ─────────────────────────────────────

describe("mixed groups + top-level endpoints", () => {
  const mixedApi = defineApi({
    baseURL: "https://test.api",
    groups: {
      products: defineGroup({
        prefix: "/products",
        endpoints: {
          list: endpoint.get("").response(z.array(ItemSchema)),
        },
      }),
    },
    endpoints: {
      healthCheck: endpoint.get("health").response(z.object({ status: z.string() })),
      listTags: endpoint
        .get("tags")
        .response(z.array(z.object({ id: z.string(), label: z.string() }))),
    },
  });

  const server = createAutoMockServer({
    source: mixedApi,
    port: 0,
    log: false,
    seed: { count: 3 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("grouped endpoint works", async () => {
    const body = await fetch(`${url}/products`).then((r) => r.json());
    expect(body).toHaveLength(3);
  });

  it("top-level endpoint works alongside groups", async () => {
    const tags = await fetch(`${url}/tags`).then((r) => r.json());
    expect(tags).toHaveLength(3);
    expect(tags[0]).toHaveProperty("label");
  });

  it("health endpoint (different derived group) works", async () => {
    const body = await fetch(`${url}/health`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("status");
  });
});
