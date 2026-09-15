import { afterEach, describe, expect, it } from "vitest";
import { createCourierServer } from "../src/create-server";
import type { CourierServer, CourierServerConfig } from "../src/types";

// --- Minimal source fixture ---

function mockEndpoint() {
  const fn = (_http: unknown, _vars: unknown) => ({ status: 200, data: { ok: true } });
  Object.defineProperty(fn, Symbol.for("courier.endpoint.schema"), {
    value: { type: "query" },
  });
  return fn;
}

function createSources() {
  return {
    api: {
      options: {
        baseURL: "http://localhost:9999",
        groups: {
          test: {
            options: { prefix: "/test" },
            hello: mockEndpoint(),
          },
        },
      },
    },
  };
}

function buildConfig(overrides?: Partial<CourierServerConfig>): CourierServerConfig {
  return {
    sources: createSources(),
    port: 0,
    host: "127.0.0.1",
    signals: false,
    ...overrides,
  };
}

// --- Helpers ---

function startServer(
  overrides?: Partial<CourierServerConfig>,
): Promise<CourierServer> {
  return new Promise((resolve) => {
    const server = createCourierServer(
      buildConfig({ ...overrides, onReady: () => resolve(server) }),
    );
  });
}

// --- Tests ---

describe("createCourierServer", () => {
  let server: CourierServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  describe("lifecycle", () => {
    it("starts and stops without errors", async () => {
      server = await startServer();
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      await server.stop();
      server = undefined;
    });

    it("resolves actual port when port: 0", async () => {
      server = await startServer();
      const port = Number(new URL(server.url).port);
      expect(port).toBeGreaterThan(0);
    });

    it("stop() is idempotent", async () => {
      server = await startServer();
      await server.stop();
      await server.stop();
      server = undefined;
    });
  });

  describe("health endpoints", () => {
    it("GET /health returns 200", async () => {
      server = await startServer();
      const res = await fetch(`${server.url}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    });

    it("GET /readyz returns 200 when healthy", async () => {
      server = await startServer();
      const res = await fetch(`${server.url}/readyz`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ready" });
    });
  });

  describe("CORS", () => {
    it("OPTIONS returns 204 with CORS headers for allowed origin", async () => {
      server = await startServer({ allowedOrigins: ["http://example.com"] });

      const res = await fetch(`${server.url}/api/test`, {
        method: "OPTIONS",
        headers: { Origin: "http://example.com" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("http://example.com");
    });

    it("OPTIONS returns 403 for disallowed origin", async () => {
      server = await startServer({ allowedOrigins: ["http://trusted.com"] });

      const res = await fetch(`${server.url}/api/test`, {
        method: "OPTIONS",
        headers: { Origin: "http://evil.com" },
      });
      expect(res.status).toBe(403);
    });

    it("blocks non-OPTIONS requests from disallowed origin", async () => {
      server = await startServer({ allowedOrigins: ["http://trusted.com"] });

      const res = await fetch(`${server.url}/`, {
        headers: { Origin: "http://evil.com" },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("SSE connection registry", () => {
    it("exposes sseConnections on server", async () => {
      server = await startServer();
      expect(server.sseConnections).toBeDefined();
      expect(server.sseConnections.count).toBe(0);
    });

    it("exposes wsConnections on server", async () => {
      server = await startServer();
      expect(server.wsConnections).toBeDefined();
      expect(server.wsConnections.count).toBe(0);
    });
  });

  describe("HTTP proxy", () => {
    it("returns 405 for unsupported methods", async () => {
      server = await startServer();

      const res = await fetch(`${server.url}/`, { method: "DELETE" });
      expect(res.status).toBe(405);
    });

    it("returns 400 for missing source param on GET", async () => {
      server = await startServer();

      const res = await fetch(`${server.url}/?_m=hello`);
      expect(res.status).toBe(400);
    });
  });
});
