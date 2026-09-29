import { describe, expect, it } from "vitest";
import { createMockClient } from "../src/create-mock-client";
import { defineScenario } from "../src/scenario";

describe("createMockClient", () => {
  it("mocks and resolves endpoint calls", async () => {
    const { client, mock, history } = createMockClient();

    mock("users", "getAll").resolves([{ id: "1", name: "Alice" }]);
    const result = await (client as any).users.getAll();

    expect(result).toEqual([{ id: "1", name: "Alice" }]);
    expect(history).toHaveLength(1);
    expect(history[0]?.mocked).toBe(true);
    expect(history[0]?.result?.status).toBe(200);
  });

  it("throws descriptive error for unmocked endpoints", async () => {
    const { client } = createMockClient();

    await expect((client as any).users.getAll()).rejects.toThrow("[courier-mock] No mock");
  });

  it("records errors in history", async () => {
    const { client, history } = createMockClient();

    await expect((client as any).users.getAll()).rejects.toThrow();
    expect(history).toHaveLength(1);
    expect(history[0]?.error).toBeDefined();
    expect(history[0]?.mocked).toBe(false);
  });

  it("rejects with HTTPError", async () => {
    const { client, mock } = createMockClient();
    mock("users", "getAll").rejects(403, { message: "Forbidden" });

    try {
      await (client as any).users.getAll();
      expect.unreachable();
    } catch (error: any) {
      expect(error.status).toBe(403);
      expect(error.data).toEqual({ message: "Forbidden" });
    }
  });

  it("supports dynamic returns with variables", async () => {
    const { client, mock } = createMockClient();
    mock("users", "getById").returns((ctx) => ({
      id: (ctx.variables as any)?.id,
      name: "User",
    }));

    const result = await (client as any).users.getById({ id: "42" });
    expect(result).toEqual({ id: "42", name: "User" });
  });

  it("supports sequence responses", async () => {
    const { client, mock } = createMockClient();
    mock("users", "getAll").sequence([[], [{ id: "1" }], [{ id: "1" }, { id: "2" }]]);

    expect(await (client as any).users.getAll()).toEqual([]);
    expect(await (client as any).users.getAll()).toEqual([{ id: "1" }]);
    expect(await (client as any).users.getAll()).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("tracks callIndex in context", async () => {
    const { client, mock } = createMockClient();
    const indices: number[] = [];
    mock("users", "getAll").returns((ctx) => {
      indices.push(ctx.callIndex);
      return [];
    });

    await (client as any).users.getAll();
    await (client as any).users.getAll();
    await (client as any).users.getAll();

    expect(indices).toEqual([0, 1, 2]);
  });

  it("resets all state", async () => {
    const { client, mock, history, reset } = createMockClient();
    mock("users", "getAll").resolves([]);
    await (client as any).users.getAll();

    reset();
    expect(history).toHaveLength(0);
    await expect((client as any).users.getAll()).rejects.toThrow();
  });

  describe("scenarios", () => {
    it("applies initial scenario", async () => {
      const scenario = defineScenario("happy", (mock: any) => {
        mock("users", "getAll").resolves([{ id: "1" }]);
      });

      const { client } = createMockClient({ scenario });
      const result = await (client as any).users.getAll();
      expect(result).toEqual([{ id: "1" }]);
    });

    it("switches scenarios with applyScenario", async () => {
      const happy = defineScenario("happy", (mock: any) => {
        mock("users", "getAll").resolves([{ id: "1" }]);
      });
      const error = defineScenario("error", (mock: any) => {
        mock("users", "getAll").rejects(500);
      });

      const mc = createMockClient({ scenario: happy });
      expect(await (mc.client as any).users.getAll()).toEqual([{ id: "1" }]);

      mc.applyScenario(error);
      await expect((mc.client as any).users.getAll()).rejects.toThrow();
    });
  });

  describe("WireMock-style state machine", () => {
    it("transitions between states", async () => {
      const { client, mock } = createMockClient();

      mock("auth", "login")
        .inState("Started")
        .returns(() => ({ token: "jwt" }))
        .transitionTo("authenticated");

      mock("users", "getAll")
        .inState("authenticated")
        .resolves([{ id: "1" }]);

      mock("users", "getAll").inState("Started").rejects(401);

      // Before login — should 401
      await expect((client as any).users.getAll()).rejects.toThrow();

      // Login — transitions to "authenticated"
      await (client as any).auth.login();

      // After login — should succeed
      const result = await (client as any).users.getAll();
      expect(result).toEqual([{ id: "1" }]);
    });
  });

  describe("network simulation", () => {
    it("applies delay from mock builder", async () => {
      const { client, mock, history } = createMockClient();
      mock("users", "getAll").resolves([]).delay(50);

      await (client as any).users.getAll();
      expect(history[0]!.duration).toBeGreaterThanOrEqual(40);
    });

    it("fails randomly when errorRate is set", async () => {
      const { client, mock } = createMockClient({
        network: { errorRate: 1.0 }, // 100% failure rate
      });
      mock("users", "getAll").resolves([]);

      await expect((client as any).users.getAll()).rejects.toThrow();
    });
  });
});
