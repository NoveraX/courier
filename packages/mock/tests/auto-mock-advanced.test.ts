import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const ItemSchema = z.object({ id: z.string(), name: z.string(), price: z.number() });

const api = defineApi({
  expose: true,
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
        update: endpoint.patch(":id").response(ItemSchema),
        delete: endpoint.del(":id"),
      },
    }),
  },
});

// ── .times(n) ───────────────────────────────────────────────────────────────

describe(".times(n)", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 3 },
    overrides: (mock) => {
      mock("items", "list")
        .resolves([{ id: "t", name: "Limited", price: 0 }])
        .times(2);
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("returns override for first N calls, then falls back", async () => {
    const r1 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r1).toEqual([{ id: "t", name: "Limited", price: 0 }]);

    const r2 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r2).toEqual([{ id: "t", name: "Limited", price: 0 }]);

    // 3rd call → auto-CRUD fallback
    const r3 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r3.length).toBe(3);
    expect(r3[0].id).not.toBe("t");
  });
});

// ── .delay(ms) ──────────────────────────────────────────────────────────────

describe(".delay(ms)", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 2 },
    overrides: (mock) => {
      mock("items", "list").delay(100);
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("delays response by specified ms", async () => {
    const start = performance.now();
    const body = await fetch(`${url}/items`).then((r) => r.json());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(body).toHaveLength(2);
  });
});

// ── Multiple .once() stacking (LIFO) ───────────────────────────────────────

describe("multiple .once() stacking", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 3 },
    overrides: (mock) => {
      // Bottom of stack
      mock("items", "list")
        .resolves([{ id: "a", name: "First", price: 1 }])
        .once();
      // Top of stack (LIFO → returned first)
      mock("items", "list")
        .resolves([{ id: "b", name: "Second", price: 2 }])
        .once();
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("pops handlers in LIFO order, then falls back to auto-CRUD", async () => {
    const r1 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r1[0].name).toBe("Second"); // top of stack

    const r2 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r2[0].name).toBe("First"); // next on stack

    const r3 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r3.length).toBe(3); // auto-CRUD fallback
  });
});

// ── callIndex ───────────────────────────────────────────────────────────────

describe("callIndex tracking", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 0 },
    overrides: (mock) => {
      mock("items", "list").returns((ctx) => [
        { id: "idx", name: `call-${ctx.callIndex}`, price: ctx.callIndex },
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

  it("increments callIndex per endpoint", async () => {
    const r0 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r0[0].name).toBe("call-0");

    const r1 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r1[0].name).toBe("call-1");

    const r2 = await fetch(`${url}/items`).then((r) => r.json());
    expect(r2[0].name).toBe("call-2");
  });
});

// ── throw in .returns() → 500 ───────────────────────────────────────────────

describe("error handling in returns()", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 1 },
    overrides: (mock) => {
      mock("items", "get").returns(() => {
        throw new Error("Database connection lost");
      });
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("returns 500 with error message", async () => {
    const res = await fetch(`${url}/items/id-1`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Database connection lost");
  });
});

// ── Proxy route POST /api/request ───────────────────────────────────────────

describe("proxy route (POST /api/request)", () => {
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

  it("resolves via group+method", async () => {
    const res = await fetch(`${url}/api/request?_s=api&_g=items&_m=list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(5);
  });

  it("passes variables to handler", async () => {
    const res = await fetch(`${url}/api/request?_s=api&_g=items&_m=get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variables: { id: "id-1" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("id-1");
  });

  it("returns 404 for unknown endpoint", async () => {
    const res = await fetch(`${url}/api/request?_s=api&_g=unknown&_m=nope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

// ── History tracking ────────────────────────────────────────────────────────

describe("request history", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 2 },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("records requests in server.history", async () => {
    const before = server.history.length;

    await fetch(`${url}/items`);
    await fetch(`${url}/items/id-1`);

    expect(server.history.length).toBe(before + 2);
    const last = server.history[server.history.length - 1]!;
    expect(last.group).toBe("items");
    expect(last.method).toBe("get");
    expect(last.mocked).toBe(true);
    expect(last.duration).toBeGreaterThanOrEqual(0);
    expect(last.timestamp).toBeGreaterThan(0);
  });
});

// ── Store CRUD ──────────────────────────────────────────────────────────────

describe("store direct access", () => {
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

  it("store.collection lists seeded records", () => {
    const col = server.store.collection("items");
    expect(col.count()).toBe(3);
    expect(col.getAll().length).toBe(3);
  });

  it("store.collection.create adds record accessible via HTTP", async () => {
    server.store.collection("items").create({ id: "manual-1", name: "Manual", price: 999 });

    const body = await fetch(`${url}/items`).then((r) => r.json());
    const found = body.find((r: Record<string, unknown>) => r.id === "manual-1");
    expect(found).toBeDefined();
    expect(found.name).toBe("Manual");
  });

  it("store.collection.getById returns by id", () => {
    const record = server.store.collection("items").getById("id-1");
    expect(record).toBeDefined();
    expect(record!.id).toBe("id-1");
  });
});

// ── Scenario switching ──────────────────────────────────────────────────────

describe("scenario switching", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 5 },
    scenarios: {
      empty: {
        name: "empty",
        apply(mock) {
          (mock as any)("items", "list").resolves([]);
        },
      },
      error: {
        name: "error",
        apply(mock) {
          (mock as any)("items", "list").rejects(503, { message: "Down" });
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

  it("starts with happy-path (auto-CRUD)", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body.length).toBeGreaterThanOrEqual(5);
  });

  it("switches to empty scenario", () => {
    server.applyScenario({
      name: "empty",
      apply: (mock) => {
        (mock as any)("items", "list").resolves([]);
      },
    });
  });

  it("returns empty after scenario switch", async () => {
    const body = await fetch(`${url}/items`).then((r) => r.json());
    expect(body).toEqual([]);
  });

  it("switches to error scenario", () => {
    server.applyScenario({
      name: "error",
      apply: (mock) => {
        (mock as any)("items", "list").rejects(503, { message: "Down" });
      },
    });
  });

  it("returns error after scenario switch", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.status).toBe(503);
  });
});

// ── withHeaders merge ───────────────────────────────────────────────────────

describe("withHeaders merge", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    seed: { count: 1 },
    overrides: (mock) => {
      mock("items", "list").withHeaders({ "X-A": "1" }).withHeaders({ "X-B": "2" });
    },
  });

  let url: string;
  beforeAll(async () => {
    url = (await server.start()).url;
  });
  afterAll(async () => {
    await server.stop();
  });

  it("merges multiple withHeaders calls", async () => {
    const res = await fetch(`${url}/items`);
    expect(res.headers.get("x-a")).toBe("1");
    expect(res.headers.get("x-b")).toBe("2");
  });
});
