import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineApi, defineGroup } from "../src/define/index";
import { HTTPError } from "../src/error";
import type { HttpMethods } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200, headers = new Headers()) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse({}));
  vi.stubGlobal("fetch", fetchSpy);
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
      fetchSpy.mockResolvedValue(mockFetchResponse(responseData));

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
      fetchSpy.mockResolvedValue(mockFetchResponse(responseData));

      const methodFn = vi.fn((methods: HttpMethods, _vars: unknown) =>
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
      fetchSpy.mockResolvedValue(mockFetchResponse(responseData));

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
      fetchSpy.mockResolvedValue(mockFetchResponse(responseData));

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
      fetchSpy.mockResolvedValue(mockFetchResponse(responseData));

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
      fetchSpy.mockResolvedValue(mockFetchResponse(responseData));

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

  describe("middleware", () => {
    it("middleware receives context with source and method", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const spy = vi.fn();
      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { middleware: [async (ctx: any, next: any) => { spy(ctx); return next(); }] },
      );
      const sources = { users: source };

      await executeRequest(sources, { source: "users", method: "list" });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "users",
          method: "list",
        }),
      );
    });

    it("middleware can modify variables", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ ok: true }));

      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { middleware: [async (ctx: any, next: any) => {
          ctx.variables = { modified: true };
          return next();
        }] },
      );
      const sources = { users: source };

      await executeRequest(sources, { source: "users", method: "list" });

      expect(fetchSpy).toHaveBeenCalled();
    });

    it("middleware can transform response", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ raw: true }));

      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { middleware: [async (_ctx: any, next: any) => {
          const res = await next();
          return { ...res, data: { transformed: true } };
        }] },
      );
      const sources = { users: source };

      const result = await executeRequest(sources, { source: "users", method: "list" });

      expect(result).toEqual({ transformed: true });
    });

    it("middleware can catch errors from endpoint", async () => {
      const errorSpy = vi.fn();
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
        { middleware: [async (_ctx: any, next: any) => {
          try { return await next(); } catch (e: any) { errorSpy(e); throw e; }
        }] },
      );
      const sources = { api: source };

      try {
        await executeRequest(sources, { source: "api", method: "fail" });
      } catch {
        // expected
      }

      expect(errorSpy).toHaveBeenCalledWith(expect.any(HTTPError));
    });

    it("middleware rejection throws HTTPError", async () => {
      const source = createTestSource(
        { list: (methods: HttpMethods) => methods.get("users") },
        { middleware: [async () => {
          throw new HTTPError({
            status: 403,
            headers: new Headers(),
            data: { message: "Forbidden" },
          });
        }] },
      );
      const sources = { users: source };

      try {
        await executeRequest(sources, { source: "users", method: "list" });
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(403);
      }
    });
  });

  describe("204 No Content", () => {
    it("handles 204 response correctly", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(null, 204));

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
      fetchSpy.mockResolvedValue(new Response(stream, {
        status: 200,
        headers: new Headers(),
      }));

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
          data: expect.any(ReadableStream),
        }),
      );
    });
  });
});
