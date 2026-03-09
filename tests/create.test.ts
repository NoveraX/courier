import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../src/error";

vi.mock("ky", () => {
  class KYHTTPError extends Error {
    response: any;
    constructor(response: any) {
      super(`HTTP ${response.status}`);
      this.name = "HTTPError";
      this.response = response;
    }
  }

  return {
    default: { post: vi.fn(), get: vi.fn() },
    HTTPError: KYHTTPError,
  };
});

import ky, { HTTPError as KYHTTPError } from "ky";
import { createClientRequest } from "../src/create";

const mockPost = vi.mocked(ky.post);
const mockGet = vi.mocked(ky.get);

function createKyError(response: Record<string, unknown>) {
  const error = Object.create(KYHTTPError.prototype);
  error.response = response;
  error.message = `HTTP ${response.status}`;
  return error;
}

function kyResponse(data: unknown, status = 200) {
  const response = { status, headers: new Headers(), ok: status < 400 };
  const p = Promise.resolve(response);
  (p as any).json = () => Promise.resolve(data);
  (p as any).text = () => Promise.resolve(JSON.stringify(data));
  return p as any;
}

function kyRejectedResponse(error: unknown) {
  return { json: () => Promise.reject(error) } as any;
}

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createClientRequest", () => {
  it("returns a curried function", () => {
    const client = createClientRequest() as any;
    expect(typeof client).toBe("function");
    const execute = client("api");
    expect(typeof execute).toBe("function");
  });

  describe("JSON payload", () => {
    it("sends correct JSON payload via ky.post", async () => {
      mockPost.mockReturnValue(kyResponse({ id: 1 }));

      const client = createClientRequest() as any;
      await client("api")("getUser", { id: 1 });

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          json: expect.objectContaining({
            source: "api",
            method: "getUser",
            variables: { id: 1 },
          }),
        }),
      );
    });

    it("parses group:method in endpoint key", async () => {
      mockPost.mockReturnValue(kyResponse({ token: "abc" }));

      const client = createClientRequest() as any;
      await client("api")("auth:login", { email: "test@test.com" });

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          json: expect.objectContaining({
            source: "api",
            group: "auth",
            method: "login",
            variables: { email: "test@test.com" },
          }),
        }),
      );
    });

    it("sends endpoint without variables", async () => {
      mockPost.mockReturnValue(kyResponse({ users: [] }));

      const client = createClientRequest() as any;
      await client("api")("list");

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          json: expect.objectContaining({
            source: "api",
            method: "list",
            variables: undefined,
          }),
        }),
      );
    });
  });

  describe("FormData payload", () => {
    it("sends FormData with meta fields", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const fd = new FormData();
      fd.append("file", new File(["content"], "test.txt"));

      const client = createClientRequest() as any;
      await client("api")("upload", fd);

      const call = mockPost.mock.calls[0];
      expect(call?.[0]).toBe("/api/request");

      const body = call?.[1]?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("_source")).toBe("api");
      expect(body.get("_method")).toBe("upload");
      expect(body.has("file")).toBe(true);
    });
  });

  describe("defaults", () => {
    it("uses custom routePath", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const client = createClientRequest({ routePath: "custom-route" }) as any;
      await client("api")("list");

      expect(mockPost).toHaveBeenCalledWith("/api/custom-route", expect.any(Object));
    });

    it("applies default timeout", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const client = createClientRequest({ timeout: 10000 }) as any;
      await client("api")("list");

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it("option timeout overrides default timeout", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const client = createClientRequest({ timeout: 10000 }) as any;
      await client("api", { timeout: 5000 })("list");

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it("sends default headers", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const client = createClientRequest({ headers: { "x-api-key": "abc" } }) as any;
      await client("api")("list");

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          headers: { "x-api-key": "abc" },
        }),
      );
    });

    it("sends credentials: include by default", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const client = createClientRequest() as any;
      await client("api")("list");

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  describe("stream mode", () => {
    it("returns raw response when stream is true", async () => {
      const streamResponse = { status: 200, headers: new Headers(), body: "stream" };
      mockPost.mockResolvedValue(streamResponse as any);

      const client = createClientRequest() as any;
      const result = await client("api", { stream: true })("events");

      expect(result).toBe(streamResponse);
    });

    it("includes stream option in server options", async () => {
      mockPost.mockResolvedValue({ status: 200, headers: new Headers() } as any);

      const client = createClientRequest() as any;
      await client("api", { stream: true })("events");

      expect(mockPost).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          json: expect.objectContaining({
            options: expect.objectContaining({ stream: true }),
          }),
        }),
      );
    });
  });

  describe("callbacks", () => {
    it("calls globalOnSuccess with data", async () => {
      const data = { users: [] };
      mockPost.mockReturnValue(kyResponse(data));
      const onSuccess = vi.fn();

      const client = createClientRequest({ onSuccess }) as any;
      await client("api")("list");

      expect(onSuccess).toHaveBeenCalledWith(data);
    });

    it("calls globalOnError on ky HTTPError", async () => {
      const errorResponse = {
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ error: "not found" }),
        text: () => Promise.resolve("not found"),
      };
      mockPost.mockReturnValue(kyRejectedResponse(createKyError(errorResponse)));
      const onError = vi.fn();

      const client = createClientRequest({ onError }) as any;

      await expect(client("api")("missing")).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalledWith(expect.any(HTTPError));
    });
  });

  describe("error handling", () => {
    it("converts ky HTTPError to custom HTTPError", async () => {
      const errorResponse = {
        status: 500,
        headers: new Headers(),
        json: () => Promise.resolve({ message: "Server Error" }),
        text: () => Promise.resolve("Server Error"),
      };
      mockPost.mockReturnValue(kyRejectedResponse(createKyError(errorResponse)));

      const client = createClientRequest() as any;

      try {
        await client("api")("fail");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(500);
      }
    });

    it("falls back to text when response.json() fails in error path", async () => {
      const errorResponse = {
        status: 500,
        headers: new Headers(),
        json: () => Promise.reject(new Error("parse error")),
        text: () => Promise.resolve("plain text error"),
      };
      mockPost.mockReturnValue(kyRejectedResponse(createKyError(errorResponse)));

      const client = createClientRequest() as any;

      try {
        await client("api")("fail");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).data).toBe("plain text error");
      }
    });

    it("re-throws non-ky errors unchanged", async () => {
      mockPost.mockReturnValue(kyRejectedResponse(new TypeError("network error")));

      const client = createClientRequest() as any;

      await expect(client("api")("fail")).rejects.toThrow("network error");
    });

    it("handles stream error with simplified message", async () => {
      const errorResponse = {
        status: 502,
        headers: new Headers(),
        json: () => Promise.resolve({ error: "bad gateway" }),
        text: () => Promise.resolve("bad gateway"),
      };
      mockPost.mockRejectedValue(createKyError(errorResponse));

      const client = createClientRequest() as any;

      try {
        await client("api", { stream: true })("events");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(502);
        expect((error as HTTPError).data).toEqual({
          success: false,
          message: "HTTP 502",
        });
      }
    });

    it("calls globalOnSuccess in stream mode", async () => {
      const streamResponse = { status: 200, headers: new Headers(), body: "stream" };
      mockPost.mockResolvedValue(streamResponse as any);
      const onSuccess = vi.fn();

      const client = createClientRequest({ onSuccess }) as any;
      await client("api", { stream: true })("events");

      expect(onSuccess).toHaveBeenCalledWith(streamResponse);
    });

    it("calls globalOnError in stream error path", async () => {
      const errorResponse = {
        status: 500,
        headers: new Headers(),
        json: () => Promise.resolve({ error: "fail" }),
        text: () => Promise.resolve("fail"),
      };
      mockPost.mockRejectedValue(createKyError(errorResponse));
      const onError = vi.fn();

      const client = createClientRequest({ onError }) as any;

      await expect(client("api", { stream: true })("events")).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe("GET proxy mode", () => {
    it("uses ky.get when method: GET is set", async () => {
      mockGet.mockReturnValue(kyResponse({ users: [] }));

      const client = createClientRequest() as any;
      await client("api", { method: "GET" })("users:getAll");

      expect(mockGet).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          searchParams: expect.objectContaining({
            _s: "api",
            _g: "users",
            _m: "getAll",
          }),
        }),
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("includes variables as query params", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest() as any;
      await client("api", { method: "GET" })("users:list", { page: 2, limit: 10 });

      const call = mockGet.mock.calls[0];
      expect(call?.[1]?.searchParams).toEqual(
        expect.objectContaining({
          _s: "api",
          _g: "users",
          _m: "list",
          page: "2",
          limit: "10",
        }),
      );
    });

    it("omits _g when no group in endpoint key", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest() as any;
      await client("api", { method: "GET" })("health");

      const call = mockGet.mock.calls[0];
      const params = call?.[1]?.searchParams as Record<string, string>;
      expect(params._g).toBeUndefined();
      expect(params._m).toBe("health");
    });

    it("skips undefined/null variables", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest() as any;
      await client("api", { method: "GET" })("list", { page: 1, filter: undefined, sort: null });

      const params = mockGet.mock.calls[0]?.[1]?.searchParams as Record<string, string>;
      expect(params.page).toBe("1");
      expect(params.filter).toBeUndefined();
      expect(params.sort).toBeUndefined();
    });

    it("includes server options as _o when non-empty", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest() as any;
      await client("api", { method: "GET", rawData: true })("list");

      const params = mockGet.mock.calls[0]?.[1]?.searchParams as Record<string, string>;
      expect(JSON.parse(params._o!)).toEqual({ rawData: true });
    });

    it("omits _o when server options are empty", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest() as any;
      await client("api", { method: "GET" })("list");

      const params = mockGet.mock.calls[0]?.[1]?.searchParams as Record<string, string>;
      expect(params._o).toBeUndefined();
    });

    it("sends credentials and headers in GET mode", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest({ headers: { "x-key": "abc" } }) as any;
      await client("api", { method: "GET" })("list");

      expect(mockGet).toHaveBeenCalledWith(
        "/api/request",
        expect.objectContaining({
          credentials: "include",
          headers: { "x-key": "abc" },
        }),
      );
    });

    it("calls globalOnSuccess in GET mode", async () => {
      mockGet.mockReturnValue(kyResponse({ ok: true }));
      const onSuccess = vi.fn();

      const client = createClientRequest({ onSuccess }) as any;
      await client("api", { method: "GET" })("list");

      expect(onSuccess).toHaveBeenCalledWith({ ok: true });
    });

    it("converts ky HTTPError to custom HTTPError in GET mode", async () => {
      const errorResponse = {
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ error: "not found" }),
        text: () => Promise.resolve("not found"),
      };
      mockGet.mockReturnValue(kyRejectedResponse(createKyError(errorResponse)));

      const client = createClientRequest() as any;

      try {
        await client("api", { method: "GET" })("missing");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(404);
      }
    });

    it("calls globalOnError in GET error path", async () => {
      const errorResponse = {
        status: 500,
        headers: new Headers(),
        json: () => Promise.resolve({ error: "fail" }),
        text: () => Promise.resolve("fail"),
      };
      mockGet.mockReturnValue(kyRejectedResponse(createKyError(errorResponse)));
      const onError = vi.fn();

      const client = createClientRequest({ onError }) as any;

      await expect(client("api", { method: "GET" })("fail")).rejects.toBeInstanceOf(HTTPError);
      expect(onError).toHaveBeenCalled();
    });

    it("falls back to POST for FormData even with method: GET", async () => {
      mockPost.mockReturnValue(kyResponse({ ok: true }));

      const fd = new FormData();
      fd.append("file", new File(["x"], "f.txt"));

      const client = createClientRequest() as any;
      await client("api", { method: "GET" })("upload", fd);

      expect(mockPost).toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("uses custom routePath in GET mode", async () => {
      mockGet.mockReturnValue(kyResponse([]));

      const client = createClientRequest({ routePath: "custom" }) as any;
      await client("api", { method: "GET" })("list");

      expect(mockGet).toHaveBeenCalledWith("/api/custom", expect.any(Object));
    });
  });
});
