import { afterEach, describe, expect, it } from "vitest";
import { HTTPError } from "../src/errors";
import { createTestClient, findRequests } from "../src/testing/index";

const testClient = createTestClient();
const { client, mock, history } = testClient;

afterEach(() => {
  testClient.reset();
});

describe("createTestClient", () => {
  describe("basic mock & request", () => {
    it("returns mocked data via dot notation", async () => {
      mock("users", "getAll").resolves([{ id: "1", name: "Alice" }]);

      const result = await (client as any).users.getAll();
      expect(result).toEqual([{ id: "1", name: "Alice" }]);
    });

    it("passes variables to dynamic resolver", async () => {
      mock("users", "getById").returns((vars: any) => ({
        id: vars.id,
        name: `User ${vars.id}`,
      }));

      const result = await (client as any).users.getById({ id: "42" });
      expect(result).toEqual({ id: "42", name: "User 42" });
    });

    it("supports async resolvers", async () => {
      mock("users", "getAll").returns(async () => {
        return [{ id: "1" }];
      });

      const result = await (client as any).users.getAll();
      expect(result).toEqual([{ id: "1" }]);
    });

    it("works with different groups", async () => {
      mock("users", "list").resolves([{ id: 1 }]);
      mock("posts", "list").resolves([{ title: "Hello" }]);

      expect(await (client as any).users.list()).toEqual([{ id: 1 }]);
      expect(await (client as any).posts.list()).toEqual([{ title: "Hello" }]);
    });
  });

  describe("error mocking", () => {
    it("throws HTTPError with .rejects()", async () => {
      mock("users", "create").rejects(403, { message: "Forbidden" });

      await expect((client as any).users.create({ name: "Alice" })).rejects.toThrow(HTTPError);

      try {
        await (client as any).users.create({ name: "Bob" });
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(403);
        expect((error as HTTPError).data).toEqual({ message: "Forbidden" });
      }
    });

    it("uses default error data when none provided", async () => {
      mock("users", "fail").rejects(500);

      try {
        await (client as any).users.fail();
      } catch (error) {
        expect((error as HTTPError).data).toEqual({ success: false, message: "HTTP 500" });
      }
    });

    it("throws descriptive error when no mock is found", async () => {
      await expect((client as any).users.unknown()).rejects.toThrow(/No mock for "users.unknown"/);
    });
  });

  describe("mock lifetime", () => {
    it(".once() limits mock to a single call", async () => {
      mock("users", "getAll").resolves("first").once();

      const result = await (client as any).users.getAll();
      expect(result).toBe("first");

      await expect((client as any).users.getAll()).rejects.toThrow(/No mock/);
    });

    it(".times(n) limits mock to n calls", async () => {
      mock("users", "getAll").resolves("data").times(3);

      for (let i = 0; i < 3; i++) {
        expect(await (client as any).users.getAll()).toBe("data");
      }

      await expect((client as any).users.getAll()).rejects.toThrow(/No mock/);
    });

    it("stack: latest mock wins, falls back after consumption", async () => {
      mock("users", "getAll").resolves("default");
      mock("users", "getAll").resolves("override").once();

      // First call: override (consumed)
      expect(await (client as any).users.getAll()).toBe("override");
      // Subsequent: default (permanent)
      expect(await (client as any).users.getAll()).toBe("default");
      expect(await (client as any).users.getAll()).toBe("default");
    });

    it("multiple temporary mocks are consumed LIFO", async () => {
      mock("users", "getAll").resolves("first").once();
      mock("users", "getAll").resolves("second").once();

      // LIFO: second first, then first
      expect(await (client as any).users.getAll()).toBe("second");
      expect(await (client as any).users.getAll()).toBe("first");
      await expect((client as any).users.getAll()).rejects.toThrow(/No mock/);
    });
  });

  describe("delay", () => {
    it("adds artificial delay before responding", async () => {
      mock("tasks", "slow").resolves("done").delay(50);

      const start = Date.now();
      const result = await (client as any).tasks.slow();
      const elapsed = Date.now() - start;

      expect(result).toBe("done");
      expect(elapsed).toBeGreaterThanOrEqual(40); // allow some timer variance
    });

    it("adds delay before rejecting", async () => {
      mock("tasks", "slowFail").rejects(500).delay(50);

      const start = Date.now();
      await expect((client as any).tasks.slowFail()).rejects.toThrow(HTTPError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("history tracking", () => {
    it("records successful requests", async () => {
      mock("users", "getAll").resolves([{ id: "1" }]);
      await (client as any).users.getAll();

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        group: "users",
        method: "getAll",
        variables: undefined,
        result: { status: 200, data: [{ id: "1" }] },
      });
      expect(history[0]?.timestamp).toBeTypeOf("number");
    });

    it("records variables in history", async () => {
      mock("users", "create").resolves({ id: "new" });
      await (client as any).users.create({ name: "Alice" });

      expect(history[0]?.variables).toEqual({ name: "Alice" });
    });

    it("records failed requests", async () => {
      mock("users", "delete").rejects(404, { message: "Not found" });

      try {
        await (client as any).users.delete({ id: "999" });
      } catch {
        // expected
      }

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        group: "users",
        method: "delete",
        result: { status: 404, data: { message: "Not found" } },
      });
      expect(history[0]?.error).toBeInstanceOf(HTTPError);
    });

    it("records unmocked requests as errors", async () => {
      try {
        await (client as any).unknown.endpoint();
      } catch {
        // expected
      }

      expect(history).toHaveLength(1);
      expect(history[0]?.error).toBeInstanceOf(Error);
      expect(history[0]?.error?.message).toMatch(/No mock/);
    });

    it("tracks multiple requests in order", async () => {
      mock("users", "a").resolves(1);
      mock("users", "b").resolves(2);
      mock("posts", "c").resolves(3);

      await (client as any).users.a();
      await (client as any).users.b();
      await (client as any).posts.c();

      expect(history).toHaveLength(3);
      expect(history.map((e) => `${e.group}.${e.method}`)).toEqual([
        "users.a",
        "users.b",
        "posts.c",
      ]);
    });
  });

  describe("reset methods", () => {
    it("reset() clears mocks and history", async () => {
      mock("users", "getAll").resolves([]);
      await (client as any).users.getAll();

      expect(history).toHaveLength(1);

      testClient.reset();

      expect(history).toHaveLength(0);
      await expect((client as any).users.getAll()).rejects.toThrow(/No mock/);
    });

    it("resetMocks() clears only mocks", async () => {
      mock("users", "getAll").resolves([]);
      await (client as any).users.getAll();

      testClient.resetMocks();

      expect(history).toHaveLength(1); // history preserved
      await expect((client as any).users.getAll()).rejects.toThrow(/No mock/);
    });

    it("resetHistory() clears only history", async () => {
      mock("users", "getAll").resolves([]);
      await (client as any).users.getAll();

      testClient.resetHistory();

      expect(history).toHaveLength(0);
      // mock still works
      const result = await (client as any).users.getAll();
      expect(result).toEqual([]);
    });
  });

  describe("fluent builder chaining", () => {
    it("supports chaining .resolves().once()", async () => {
      mock("misc", "x").resolves("data").once();

      expect(await (client as any).misc.x()).toBe("data");
      await expect((client as any).misc.x()).rejects.toThrow(/No mock/);
    });

    it("supports chaining .rejects().delay()", async () => {
      mock("misc", "x").rejects(500).delay(10);

      const start = Date.now();
      await expect((client as any).misc.x()).rejects.toThrow(HTTPError);
      expect(Date.now() - start).toBeGreaterThanOrEqual(5);
    });

    it("supports chaining .returns().times().delay()", async () => {
      mock("misc", "x")
        .returns(() => "dynamic")
        .times(2)
        .delay(10);

      expect(await (client as any).misc.x()).toBe("dynamic");
      expect(await (client as any).misc.x()).toBe("dynamic");
      await expect((client as any).misc.x()).rejects.toThrow(/No mock/);
    });
  });

  describe("proxy safety", () => {
    it("does not trigger thenable detection", async () => {
      const result = await Promise.resolve(client);
      expect(result).toBe(client);
    });
  });
});

describe("findRequests", () => {
  const fixture = createTestClient();

  afterEach(() => {
    fixture.reset();
  });

  it("filters by group", async () => {
    fixture.mock("users", "a").resolves(1);
    fixture.mock("auth", "b").resolves(2);
    fixture.mock("users", "c").resolves(3);

    await (fixture.client as any).users.a();
    await (fixture.client as any).auth.b();
    await (fixture.client as any).users.c();

    const usersRequests = findRequests(fixture.history, "users");
    expect(usersRequests).toHaveLength(2);
    expect(usersRequests.map((e) => e.method)).toEqual(["a", "c"]);
  });

  it("filters by group and method", async () => {
    fixture.mock("users", "getAll").resolves([]);
    fixture.mock("users", "create").resolves({});

    await (fixture.client as any).users.getAll();
    await (fixture.client as any).users.create({ name: "Alice" });
    await (fixture.client as any).users.getAll();

    const getRequests = findRequests(fixture.history, "users", "getAll");
    expect(getRequests).toHaveLength(2);

    const createRequests = findRequests(fixture.history, "users", "create");
    expect(createRequests).toHaveLength(1);
    expect(createRequests[0]?.variables).toEqual({ name: "Alice" });
  });

  it("returns empty array when no matches", () => {
    expect(findRequests([], "users")).toEqual([]);
    expect(findRequests([], "users", "getAll")).toEqual([]);
  });
});
