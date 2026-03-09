import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/error";
import type { HttpMethods } from "../src/instance/types";
import { executeRequest } from "../src/utils/createRequest";

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
  const source = { options, ...methods };
  return source;
}

describe("executeRequest", () => {
  describe("source validation", () => {
    it("throws HTTPError 400 when source not found", async () => {
      const sources = {};

      try {
        await executeRequest(sources, { source: "nonexistent", method: "list" });
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
        await executeRequest({}, { method: "list" });
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
        await executeRequest(sources, { source: "users", method: "nonexistent" });
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
        await executeRequest(sources, { source: "users", method: "list" });
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
        list: (methods: HttpMethods) => methods.get("users"),
      });
      const sources = { users: source };

      const result = await executeRequest(sources, {
        source: "users",
        method: "list",
      });

      expect(result).toEqual(responseData);
    });

    it("passes variables to method", async () => {
      const responseData = { id: 1, name: "Alice" };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const methodFn = vi.fn((methods: HttpMethods, vars: unknown) =>
        methods.get("users/1"),
      );
      const source = createTestSource({ getUser: methodFn });
      const sources = { users: source };

      await executeRequest(sources, {
        source: "users",
        method: "getUser",
        variables: { id: 1 },
      });

      expect(methodFn).toHaveBeenCalledWith(expect.any(Object), { id: 1 });
    });

    it("returns rawData when rawData option is true", async () => {
      const responseData = { users: [] };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const source = createTestSource({
        list: (methods: HttpMethods) => methods.get("users"),
      });
      const sources = { users: source };

      const result = await executeRequest(sources, {
        source: "users",
        method: "list",
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
    it("wraps HTTPError from HttpClient and re-throws", async () => {
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
        await executeRequest(sources, { source: "api", method: "fail" });
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
        await executeRequest(sources, { source: "api", method: "fail" });
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
        await executeRequest(sources, { source: "api", method: "fail" });
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

      const loginFn = vi.fn((methods: HttpMethods) => methods.post("login"));

      const source = defineApi({
        groups: {
          auth: defineGroup({
            prefix: "auth",
            endpoints: { login: loginFn as any },
          }),
        },
      });
      const sources = { api: source };

      const result = await executeRequest(sources, {
        source: "api",
        group: "auth",
        method: "login",
      });

      expect(loginFn).toHaveBeenCalled();
      expect(result).toEqual(responseData);
    });

    it("falls back to source method if not found in group", async () => {
      const responseData = { health: "ok" };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const healthFn = vi.fn((methods: HttpMethods) => methods.get("health"));

      const emptyGroup = defineGroup({ endpoints: {} });
      const source = {
        options: { groups: { misc: emptyGroup } },
        health: healthFn,
      };
      const sources = { api: source };

      const result = await executeRequest(sources, {
        source: "api",
        group: "misc",
        method: "health",
      });

      expect(healthFn).toHaveBeenCalled();
      expect(result).toEqual(responseData);
    });
  });

  describe("FormData input", () => {
    it("parses request options from FormData", async () => {
      const responseData = { ok: true };
      mockKyInstance.get.mockResolvedValue(mockResponse(responseData));

      const listFn = vi.fn((methods: HttpMethods) => methods.get("items"));
      const source = createTestSource({ list: listFn });
      const sources = { items: source };

      const fd = new FormData();
      fd.append("_source", "items");
      fd.append("_method", "list");

      const result = await executeRequest(sources, fd);
      expect(listFn).toHaveBeenCalled();
      expect(result).toEqual(responseData);
    });
  });

  describe("hooks", () => {
    it("calls onRequest hook before execution", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ ok: true }));

      const onRequest = vi.fn();
      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { onRequest },
      );
      const sources = { users: source };

      await executeRequest(sources, { source: "users", method: "list" });

      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "users",
          method: "list",
        }),
      );
    });

    it("onRequest can modify hookInfo", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ ok: true }));

      const onRequest = vi.fn(() => ({
        source: "users",
        method: "list",
        variables: { modified: true },
      }));
      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { onRequest },
      );
      const sources = { users: source };

      await executeRequest(sources, { source: "users", method: "list" });

      expect(onRequest).toHaveBeenCalled();
    });

    it("calls onResponse hook after success", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ users: [] }));

      const onResponse = vi.fn();
      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { onResponse },
      );
      const sources = { users: source };

      await executeRequest(sources, { source: "users", method: "list" });

      expect(onResponse).toHaveBeenCalledWith(
        expect.objectContaining({ source: "users", method: "list" }),
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
        { list: (methods: HttpMethods) => methods.get("users") },
        { onResponse },
      );
      const sources = { users: source };

      const result = await executeRequest(sources, { source: "users", method: "list" });

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
        await executeRequest(sources, { source: "api", method: "fail" });
      } catch {
        // expected
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ source: "api", method: "fail" }),
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
        { list: (methods: HttpMethods) => methods.get("users") },
        { onRequest, onError },
      );
      const sources = { users: source };

      try {
        await executeRequest(sources, { source: "users", method: "list" });
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
        remove: (methods: HttpMethods) => methods.get("users/1"),
      });
      const sources = { users: source };

      const result = await executeRequest(sources, {
        source: "users",
        method: "remove",
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
        events: (methods: HttpMethods) => methods.get("events"),
      });
      const sources = { api: source };

      const result = await executeRequest(sources, {
        source: "api",
        method: "events",
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
