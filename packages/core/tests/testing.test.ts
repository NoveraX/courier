import { afterEach, describe, expect, it } from "vitest";
import { HTTPError } from "../src/error";
import { createTestClient, findRequests } from "../src/testing/index";

const client = createTestClient();
const { request, mock, history } = client;

afterEach(() => {
  client.reset();
});

describe("createTestClient", () => {
  describe("basic mock & request", () => {
    it("returns mocked data for a simple endpoint", async () => {
      mock("api", "list").resolves([1, 2, 3]);

      const result = await (request as any)("api")("list");
      expect(result).toEqual([1, 2, 3]);
    });

    it("returns mocked data for a group:method endpoint", async () => {
      mock("api", "users:getAll").resolves([{ id: "1", name: "Alice" }]);

      const result = await (request as any)("api")("users:getAll");
      expect(result).toEqual([{ id: "1", name: "Alice" }]);
    });

    it("passes variables to dynamic resolver", async () => {
      mock("api", "users:getById").returns((vars: any) => ({
        id: vars.id,
        name: `User ${vars.id}`,
      }));

      const result = await (request as any)("api")("users:getById", { id: "42" });
      expect(result).toEqual({ id: "42", name: "User 42" });
    });

    it("supports async resolvers", async () => {
      mock("api", "users:getAll").returns(async () => {
        return [{ id: "1" }];
      });

      const result = await (request as any)("api")("users:getAll");
      expect(result).toEqual([{ id: "1" }]);
    });
  });

  describe("error mocking", () => {
    it("throws HTTPError with .rejects()", async () => {
      mock("api", "users:create").rejects(403, { message: "Forbidden" });

      await expect((request as any)("api")("users:create", { name: "Alice" })).rejects.toThrow(
        HTTPError,
      );

      try {
        await (request as any)("api")("users:create", { name: "Bob" });
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(403);
        expect((error as HTTPError).data).toEqual({ message: "Forbidden" });
      }
    });

    it("uses default error data when none provided", async () => {
      mock("api", "fail").rejects(500);

      try {
        await (request as any)("api")("fail");
      } catch (error) {
        expect((error as HTTPError).data).toEqual({ success: false, message: "HTTP 500" });
      }
    });

    it("throws descriptive error when no mock is found", async () => {
      await expect((request as any)("api")("unknown:endpoint")).rejects.toThrow(
        /No mock for "api" > "unknown:endpoint"/,
      );
    });
  });

  describe("mock lifetime", () => {
    it(".once() limits mock to a single call", async () => {
      mock("api", "users:getAll").resolves("first").once();

      const result = await (request as any)("api")("users:getAll");
      expect(result).toBe("first");

      await expect((request as any)("api")("users:getAll")).rejects.toThrow(/No mock/);
    });

    it(".times(n) limits mock to n calls", async () => {
      mock("api", "users:getAll").resolves("data").times(3);

      for (let i = 0; i < 3; i++) {
        expect(await (request as any)("api")("users:getAll")).toBe("data");
      }

      await expect((request as any)("api")("users:getAll")).rejects.toThrow(/No mock/);
    });

    it("stack: latest mock wins, falls back after consumption", async () => {
      mock("api", "users:getAll").resolves("default");
      mock("api", "users:getAll").resolves("override").once();

      // First call: override (consumed)
      expect(await (request as any)("api")("users:getAll")).toBe("override");
      // Subsequent: default (permanent)
      expect(await (request as any)("api")("users:getAll")).toBe("default");
      expect(await (request as any)("api")("users:getAll")).toBe("default");
    });

    it("multiple temporary mocks are consumed LIFO", async () => {
      mock("api", "users:getAll").resolves("first").once();
      mock("api", "users:getAll").resolves("second").once();

      // LIFO: second first, then first
      expect(await (request as any)("api")("users:getAll")).toBe("second");
      expect(await (request as any)("api")("users:getAll")).toBe("first");
      await expect((request as any)("api")("users:getAll")).rejects.toThrow(/No mock/);
    });
  });

  describe("delay", () => {
    it("adds artificial delay before responding", async () => {
      mock("api", "slow").resolves("done").delay(50);

      const start = Date.now();
      const result = await (request as any)("api")("slow");
      const elapsed = Date.now() - start;

      expect(result).toBe("done");
      expect(elapsed).toBeGreaterThanOrEqual(40); // allow some timer variance
    });

    it("adds delay before rejecting", async () => {
      mock("api", "slow-fail").rejects(500).delay(50);

      const start = Date.now();
      await expect((request as any)("api")("slow-fail")).rejects.toThrow(HTTPError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("history tracking", () => {
    it("records successful requests", async () => {
      mock("api", "users:getAll").resolves([{ id: "1" }]);
      await (request as any)("api")("users:getAll");

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        source: "api",
        endpoint: "users:getAll",
        group: "users",
        method: "getAll",
        variables: undefined,
        result: { status: 200, data: [{ id: "1" }] },
      });
      expect(history[0]?.timestamp).toBeTypeOf("number");
    });

    it("records variables in history", async () => {
      mock("api", "users:create").resolves({ id: "new" });
      await (request as any)("api")("users:create", { name: "Alice" });

      expect(history[0]?.variables).toEqual({ name: "Alice" });
    });

    it("records failed requests", async () => {
      mock("api", "users:delete").rejects(404, { message: "Not found" });

      try {
        await (request as any)("api")("users:delete", { id: "999" });
      } catch {
        // expected
      }

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        source: "api",
        endpoint: "users:delete",
        result: { status: 404, data: { message: "Not found" } },
      });
      expect(history[0]?.error).toBeInstanceOf(HTTPError);
    });

    it("records unmocked requests as errors", async () => {
      try {
        await (request as any)("api")("nonexistent");
      } catch {
        // expected
      }

      expect(history).toHaveLength(1);
      expect(history[0]?.error).toBeInstanceOf(Error);
      expect(history[0]?.error?.message).toMatch(/No mock/);
    });

    it("tracks multiple requests in order", async () => {
      mock("api", "a").resolves(1);
      mock("api", "b").resolves(2);
      mock("api", "c").resolves(3);

      await (request as any)("api")("a");
      await (request as any)("api")("b");
      await (request as any)("api")("c");

      expect(history).toHaveLength(3);
      expect(history.map((e) => e.endpoint)).toEqual(["a", "b", "c"]);
    });

    it("parses group and method for simple endpoints", async () => {
      mock("api", "list").resolves([]);
      await (request as any)("api")("list");

      expect(history[0]).toMatchObject({
        group: undefined,
        method: "list",
      });
    });
  });

  describe("reset methods", () => {
    it("reset() clears mocks and history", async () => {
      mock("api", "users:getAll").resolves([]);
      await (request as any)("api")("users:getAll");

      expect(history).toHaveLength(1);

      client.reset();

      expect(history).toHaveLength(0);
      await expect((request as any)("api")("users:getAll")).rejects.toThrow(/No mock/);
    });

    it("resetMocks() clears only mocks", async () => {
      mock("api", "users:getAll").resolves([]);
      await (request as any)("api")("users:getAll");

      client.resetMocks();

      expect(history).toHaveLength(1); // history preserved
      await expect((request as any)("api")("users:getAll")).rejects.toThrow(/No mock/);
    });

    it("resetHistory() clears only history", async () => {
      mock("api", "users:getAll").resolves([]);
      await (request as any)("api")("users:getAll");

      client.resetHistory();

      expect(history).toHaveLength(0);
      // mock still works
      const result = await (request as any)("api")("users:getAll");
      expect(result).toEqual([]);
    });
  });

  describe("multiple sources", () => {
    it("isolates mocks per source", async () => {
      mock("api", "users:getAll").resolves([{ source: "api" }]);
      mock("auth", "users:getAll").resolves([{ source: "auth" }]);

      const apiResult = await (request as any)("api")("users:getAll");
      const authResult = await (request as any)("auth")("users:getAll");

      expect(apiResult).toEqual([{ source: "api" }]);
      expect(authResult).toEqual([{ source: "auth" }]);
    });
  });

  describe("fluent builder chaining", () => {
    it("supports chaining .resolves().once()", async () => {
      mock("api", "x").resolves("data").once();

      expect(await (request as any)("api")("x")).toBe("data");
      await expect((request as any)("api")("x")).rejects.toThrow(/No mock/);
    });

    it("supports chaining .rejects().delay()", async () => {
      mock("api", "x").rejects(500).delay(10);

      const start = Date.now();
      await expect((request as any)("api")("x")).rejects.toThrow(HTTPError);
      expect(Date.now() - start).toBeGreaterThanOrEqual(5);
    });

    it("supports chaining .returns().times().delay()", async () => {
      mock("api", "x")
        .returns(() => "dynamic")
        .times(2)
        .delay(10);

      expect(await (request as any)("api")("x")).toBe("dynamic");
      expect(await (request as any)("api")("x")).toBe("dynamic");
      await expect((request as any)("api")("x")).rejects.toThrow(/No mock/);
    });
  });
});

describe("findRequests", () => {
  const historyFixture = createTestClient();

  afterEach(() => {
    historyFixture.reset();
  });

  it("filters by source", async () => {
    historyFixture.mock("api", "a").resolves(1);
    historyFixture.mock("auth", "b").resolves(2);
    historyFixture.mock("api", "c").resolves(3);

    await (historyFixture.request as any)("api")("a");
    await (historyFixture.request as any)("auth")("b");
    await (historyFixture.request as any)("api")("c");

    const apiRequests = findRequests(historyFixture.history, "api");
    expect(apiRequests).toHaveLength(2);
    expect(apiRequests.map((e) => e.endpoint)).toEqual(["a", "c"]);
  });

  it("filters by source and endpoint", async () => {
    historyFixture.mock("api", "users:getAll").resolves([]);
    historyFixture.mock("api", "users:create").resolves({});

    await (historyFixture.request as any)("api")("users:getAll");
    await (historyFixture.request as any)("api")("users:create", { name: "Alice" });
    await (historyFixture.request as any)("api")("users:getAll");

    const getRequests = findRequests(historyFixture.history, "api", "users:getAll");
    expect(getRequests).toHaveLength(2);

    const createRequests = findRequests(historyFixture.history, "api", "users:create");
    expect(createRequests).toHaveLength(1);
    expect(createRequests[0]?.variables).toEqual({ name: "Alice" });
  });

  it("returns empty array when no matches", () => {
    expect(findRequests([], "api")).toEqual([]);
    expect(findRequests([], "api", "users:getAll")).toEqual([]);
  });
});
