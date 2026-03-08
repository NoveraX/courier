import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { HTTPError } from "../src/error";
import { Request, RequestGroup } from "../src/RequestClass";
import type { MethodsInstance } from "../src/instance/types";
import { createRequest } from "../src/utils/createRequest";

let mockKyInstance: Record<string, ReturnType<typeof vi.fn>>;

function mockResponse(data: unknown, status = 200, headers = new Headers()) {
  return {
    status,
    headers,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
    body: new ReadableStream(),
  };
}

beforeEach(() => {
  mockKyInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
  };

  vi.spyOn(ky, "create").mockReturnValue(mockKyInstance as unknown as typeof ky);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTestSource(methods: Record<string, Function>, options = {}) {
  const source = new Request(options);
  for (const [name, fn] of Object.entries(methods)) {
    (source as Record<string, unknown>)[name] = fn;
  }
  return source;
}

describe("createRequest", () => {
  describe("source validation", () => {
    it("throws HTTPError 400 when source not found", async () => {
      const sources = {};

      try {
        await createRequest(sources, { source: "nonexistent", query: "list" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(400);
        expect((error as HTTPError).data).toEqual(
          expect.objectContaining({ message: expect.stringContaining("source not found") }),
        );
      }
    });

    it("throws HTTPError 400 when source is undefined", async () => {
      try {
        await createRequest({}, { query: "list" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(400);
      }
    });
  });

  describe("method validation", () => {
    it("throws HTTPError 400 when method not found", async () => {
      const source = createTestSource({});
      const sources = { users: source };

      try {
        await createRequest(sources, { source: "users", query: "nonexistent" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(400);
        expect((error as HTTPError).data).toEqual(
          expect.objectContaining({ message: expect.stringContaining("method not found") }),
        );
      }
    });

    it("throws HTTPError 400 when method is not a function", async () => {
      const source = createTestSource({});
      (source as Record<string, unknown>).list = "not a function";
      const sources = { users: source };

      try {
        await createRequest(sources, { source: "users", query: "list" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(400);
      }
    });
  });

  describe("successful request", () => {
    it("calls method and returns data", async () => {
      const responseData = { users: [{ id: 1, name: "Alice" }] };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const source = createTestSource({
        list: (methods: MethodsInstance) => methods.get("users"),
      });
      const sources = { users: source };

      const result = await createRequest(sources, {
        source: "users",
        query: "list",
      });

      expect(result).toEqual(responseData);
    });

    it("passes variables to method", async () => {
      const responseData = { id: 1, name: "Alice" };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const methodFn = vi.fn((methods: MethodsInstance, vars: unknown) =>
        methods.get("users/1"),
      );
      const source = createTestSource({ getUser: methodFn });
      const sources = { users: source };

      await createRequest(sources, {
        source: "users",
        query: "getUser",
        variables: { id: 1 },
      });

      expect(methodFn).toHaveBeenCalledWith(expect.any(Object), { id: 1 });
    });

    it("returns rawData when rawData option is true", async () => {
      const responseData = { users: [] };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const source = createTestSource({
        list: (methods: MethodsInstance) => methods.get("users"),
      });
      const sources = { users: source };

      const result = await createRequest(sources, {
        source: "users",
        query: "list",
        options: { rawData: true },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: 200,
          data: responseData,
        }),
      );
    });
  });

  describe("error handling", () => {
    it("wraps HTTPError from Instance and re-throws", async () => {
      const source = createTestSource({
        fail: () => {
          throw new HTTPError({
            status: 500,
            headers: new Headers(),
            data: { success: false, message: "Server Error" },
          });
        },
      });
      const sources = { api: source };

      try {
        await createRequest(sources, { source: "api", query: "fail" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(500);
      }
    });

    it("wraps generic Error as 500", async () => {
      const source = createTestSource({
        fail: () => {
          throw new Error("unexpected");
        },
      });
      const sources = { api: source };

      try {
        await createRequest(sources, { source: "api", query: "fail" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(500);
        expect((error as HTTPError).data).toEqual(
          expect.objectContaining({ message: "unexpected" }),
        );
      }
    });

    it("wraps non-Error throws as 500 with generic message", async () => {
      const source = createTestSource({
        fail: () => {
          throw "string error";
        },
      });
      const sources = { api: source };

      try {
        await createRequest(sources, { source: "api", query: "fail" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(500);
        expect((error as HTTPError).data).toEqual(
          expect.objectContaining({ message: "[SERVER ERROR]" }),
        );
      }
    });
  });

  describe("groups", () => {
    it("resolves method from group", async () => {
      const responseData = { token: "abc" };
      mockKyInstance.post.mockResolvedValue(mockResponse(responseData));

      const loginFn = vi.fn((methods: MethodsInstance) => methods.post("login"));

      const authGroup = new RequestGroup({ prefix: "auth" });
      (authGroup as Record<string, unknown>).login = loginFn;

      const source = new Request({ groups: { auth: authGroup } });
      const sources = { api: source };

      const result = await createRequest(sources, {
        source: "api",
        group: "auth",
        query: "login",
      });

      expect(loginFn).toHaveBeenCalled();
      expect(result).toEqual(responseData);
    });

    it("falls back to source method if not found in group", async () => {
      const responseData = { health: "ok" };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const healthFn = vi.fn((methods: MethodsInstance) => methods.get("health"));

      const emptyGroup = new RequestGroup();
      const source = new Request({ groups: { misc: emptyGroup } });
      (source as Record<string, unknown>).health = healthFn;
      const sources = { api: source };

      const result = await createRequest(sources, {
        source: "api",
        group: "misc",
        query: "health",
      });

      expect(healthFn).toHaveBeenCalled();
      expect(result).toEqual(responseData);
    });
  });

  describe("FormData input", () => {
    it("parses request options from FormData", async () => {
      const responseData = { ok: true };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const listFn = vi.fn((methods: MethodsInstance) => methods.get("items"));
      const source = createTestSource({ list: listFn });
      const sources = { items: source };

      const fd = new FormData();
      fd.append("_source", "items");
      fd.append("_query", "list");

      const result = await createRequest(sources, fd);
      expect(listFn).toHaveBeenCalled();
      expect(result).toEqual(responseData);
    });
  });

  describe("hooks", () => {
    it("calls onRequest hook before execution", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ ok: true }));

      const onRequest = vi.fn();
      const source = createTestSource(
        { list: (methods: MethodsInstance) => methods.get("users") },
        { onRequest },
      );
      const sources = { users: source };

      await createRequest(sources, { source: "users", query: "list" });

      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "users",
          query: "list",
        }),
      );
    });

    it("onRequest can modify hookInfo", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ ok: true }));

      const onRequest = vi.fn(() => ({
        source: "users",
        query: "list",
        variables: { modified: true },
      }));
      const source = createTestSource(
        { list: (methods: MethodsInstance) => methods.get("users") },
        { onRequest },
      );
      const sources = { users: source };

      await createRequest(sources, { source: "users", query: "list" });

      expect(onRequest).toHaveBeenCalled();
    });

    it("calls onResponse hook after success", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ users: [] }));

      const onResponse = vi.fn();
      const source = createTestSource(
        { list: (methods: MethodsInstance) => methods.get("users") },
        { onResponse },
      );
      const sources = { users: source };

      await createRequest(sources, { source: "users", query: "list" });

      expect(onResponse).toHaveBeenCalledWith(
        expect.objectContaining({ source: "users", query: "list" }),
        expect.objectContaining({ status: 200, data: { users: [] } }),
      );
    });

    it("onResponse can transform response data", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ raw: true }));

      const onResponse = vi.fn(() => ({
        status: 200,
        data: { transformed: true },
      }));
      const source = createTestSource(
        { list: (methods: MethodsInstance) => methods.get("users") },
        { onResponse },
      );
      const sources = { users: source };

      const result = await createRequest(sources, { source: "users", query: "list" });

      expect(result).toEqual({ transformed: true });
    });

    it("calls onError hook on failure", async () => {
      const onError = vi.fn();
      const source = createTestSource(
        {
          fail: () => {
            throw new HTTPError({
              status: 500,
              headers: new Headers(),
              data: { error: true },
            });
          },
        },
        { onError },
      );
      const sources = { api: source };

      try {
        await createRequest(sources, { source: "api", query: "fail" });
      } catch {
        // expected
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ source: "api", query: "fail" }),
        expect.any(HTTPError),
      );
    });

    it("onRequest rejection throws and triggers onError", async () => {
      const onError = vi.fn();
      const onRequest = vi.fn(() => {
        throw new HTTPError({
          status: 403,
          headers: new Headers(),
          data: { message: "Forbidden" },
        });
      });

      const source = createTestSource(
        { list: (methods: MethodsInstance) => methods.get("users") },
        { onRequest, onError },
      );
      const sources = { users: source };

      try {
        await createRequest(sources, { source: "users", query: "list" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(403);
      }

      expect(onError).toHaveBeenCalled();
    });
  });

  describe("204 No Content", () => {
    it("handles 204 response correctly", async () => {
      mockKyInstance.get.mockResolvedValue({
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error("no body")),
        text: () => Promise.resolve(""),
        body: null,
      });

      const source = createTestSource({
        remove: (methods: MethodsInstance) => methods.get("users/1"),
      });
      const sources = { users: source };

      const result = await createRequest(sources, {
        source: "users",
        query: "remove",
      });

      expect(result).toBeNull();
    });
  });

  describe("stream mode", () => {
    it("returns stream data when stream option is true", async () => {
      const stream = new ReadableStream();
      mockKyInstance.get.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        body: stream,
      });

      const source = createTestSource({
        events: (methods: MethodsInstance) => methods.get("events"),
      });
      const sources = { api: source };

      const result = await createRequest(sources, {
        source: "api",
        query: "events",
        options: { stream: true },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: 200,
          data: stream,
        }),
      );
    });
  });
});
