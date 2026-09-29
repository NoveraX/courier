import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineFactory } from "../src/factory";
import { defineScenario } from "../src/scenario";
import { createMockServer } from "../src/server/create-mock-server";

interface User {
  id: string;
  name: string;
}

const userFactory = defineFactory<User>({
  defaults: () => ({ id: String(Math.random()).slice(2, 8), name: "Alice" }),
});

describe("createMockServer", () => {
  const server = createMockServer({ port: 0, log: false, admin: true });
  let baseUrl: string;

  beforeAll(async () => {
    server.mock("users", "getAll").resolves(userFactory.buildList(3));
    server.mock("users", "getById").returns((ctx) => {
      const vars = ctx.variables as { id: string } | undefined;
      return userFactory.build({ id: vars?.id ?? "0", name: "Found" });
    });
    server.mock("users", "create").rejects(403);

    const info = await server.start();
    baseUrl = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("proxy route (POST /api/request)", () => {
    it("returns mocked response for known endpoint", async () => {
      const res = await fetch(`${baseUrl}/api/request?_s=api&_g=users&_m=getAll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(3);
    });

    it("passes variables to handler", async () => {
      const res = await fetch(`${baseUrl}/api/request?_s=api&_g=users&_m=getById`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: { id: "42" } }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe("42");
    });

    it("returns error for rejected mock", async () => {
      const res = await fetch(`${baseUrl}/api/request?_s=api&_g=users&_m=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
    });

    it("returns 404 for unmocked endpoint", async () => {
      const res = await fetch(`${baseUrl}/api/request?_s=api&_g=posts&_m=getAll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("No mock");
    });
  });

  describe("REST routes (GET/POST /api/:group/:method)", () => {
    it("handles GET with query params", async () => {
      const res = await fetch(`${baseUrl}/api/users/getById?id=99`);
      expect(res.status).toBe(200);
      const data = await res.json();
      /* Typed as the mapped routes type it. */
      expect(data.id).toBe(99);
    });

    it("handles POST with JSON body", async () => {
      const res = await fetch(`${baseUrl}/api/users/getAll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(3);
    });
  });

  describe("admin API", () => {
    it("GET /__admin/mocks lists registered mocks", async () => {
      const res = await fetch(`${baseUrl}/__admin/mocks`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBeGreaterThanOrEqual(3);
    });

    it("GET /__admin/history returns request log", async () => {
      const res = await fetch(`${baseUrl}/__admin/history`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBeGreaterThan(0);
    });

    it("GET /__admin/health returns status", async () => {
      const res = await fetch(`${baseUrl}/__admin/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.mocks).toBeGreaterThanOrEqual(3);
    });
  });

  describe("history tracking", () => {
    it("records requests in server.history", () => {
      expect(server.history.length).toBeGreaterThan(0);
      const entry = server.history[0];
      expect(entry?.mocked).toBe(true);
    });
  });
});

describe("createMockServer with scenarios", () => {
  it("applies initial scenario and switches via admin API", async () => {
    const happy = defineScenario("happy", (mock: any) => {
      mock("users", "getAll").resolves([{ id: "1" }]);
    });
    const empty = defineScenario("empty", (mock: any) => {
      mock("users", "getAll").resolves([]);
    });

    const server = createMockServer({
      port: 0,
      log: false,
      scenario: happy,
      scenarios: { happy, empty },
    });

    const { url } = await server.start();

    // Initial scenario
    let res = await fetch(`${url}/api/request?_s=api&_g=users&_m=getAll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    let data = await res.json();
    expect(data).toHaveLength(1);

    // Switch scenario via admin
    await fetch(`${url}/__admin/scenarios/empty`, { method: "POST" });

    res = await fetch(`${url}/api/request?_s=api&_g=users&_m=getAll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    data = await res.json();
    expect(data).toHaveLength(0);

    await server.stop();
  });
});
