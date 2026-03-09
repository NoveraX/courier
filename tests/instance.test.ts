import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { HTTPError } from "../src/error";
import { HttpClient } from "../src/instance/index";

let mockKyInstance: Record<string, ReturnType<typeof vi.fn>>;
let createSpy: MockInstance;

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

  createSpy = vi.spyOn(ky, "create").mockReturnValue(mockKyInstance as unknown as typeof ky);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpClient", () => {
  describe("constructor", () => {
    it("creates ky instance via ky.create", () => {
      new HttpClient({ baseURL: "https://api.example.com" });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ prefixUrl: "https://api.example.com" }),
      );
    });

    it("works without options", () => {
      new HttpClient();
      expect(createSpy).toHaveBeenCalled();
    });
  });

  describe("createMethods", () => {
    it("returns all 6 HTTP methods", () => {
      const instance = new HttpClient();
      const methods = instance.createMethods();
      expect(methods).toHaveProperty("get");
      expect(methods).toHaveProperty("post");
      expect(methods).toHaveProperty("put");
      expect(methods).toHaveProperty("patch");
      expect(methods).toHaveProperty("del");
      expect(methods).toHaveProperty("head");
    });

    it("each method is a function", () => {
      const instance = new HttpClient();
      const methods = instance.createMethods();
      for (const method of Object.values(methods)) {
        expect(typeof method).toBe("function");
      }
    });
  });

  describe("GET request", () => {
    it("makes GET request and returns parsed JSON", async () => {
      const data = { users: [{ id: 1 }] };
      mockKyInstance.get.mockResolvedValue(mockResponse(data));

      const instance = new HttpClient();
      const { get } = instance.createMethods();
      const result = await get("users");

      expect(mockKyInstance.get).toHaveBeenCalledWith("users", expect.any(Object));
      expect(result.status).toBe(200);
      expect(result.data).toEqual(data);
    });

    it("passes variables as searchParams for GET", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({}));

      const instance = new HttpClient();
      const { get } = instance.createMethods({ variables: { page: "1", limit: "10" } });
      await get("users");

      const callOptions = mockKyInstance.get.mock.calls[0][1];
      expect(callOptions.searchParams).toBeDefined();
      expect(callOptions.searchParams.get("page")).toBe("1");
      expect(callOptions.searchParams.get("limit")).toBe("10");
    });
  });

  describe("POST request", () => {
    it("makes POST request with JSON body", async () => {
      const data = { id: 1, name: "test" };
      mockKyInstance.post.mockResolvedValue(mockResponse(data, 201));

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      const result = await post("users", { name: "test" });

      expect(mockKyInstance.post).toHaveBeenCalledWith("users", expect.any(Object));
      expect(result.status).toBe(201);
      expect(result.data).toEqual(data);
    });

    it("sends FormData as body for POST", async () => {
      mockKyInstance.post.mockResolvedValue(mockResponse({ ok: true }));

      const fd = new FormData();
      fd.append("file", new Blob(["content"]), "test.txt");

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      await post("upload", fd);

      const callOptions = mockKyInstance.post.mock.calls[0][1];
      expect(callOptions.body).toBeInstanceOf(FormData);
    });
  });

  describe("PUT request", () => {
    it("makes PUT request", async () => {
      mockKyInstance.put.mockResolvedValue(mockResponse({ updated: true }));

      const instance = new HttpClient();
      const { put } = instance.createMethods();
      const result = await put("users/1", { name: "updated" });

      expect(mockKyInstance.put).toHaveBeenCalled();
      expect(result.data).toEqual({ updated: true });
    });
  });

  describe("PATCH request", () => {
    it("makes PATCH request", async () => {
      mockKyInstance.patch.mockResolvedValue(mockResponse({ patched: true }));

      const instance = new HttpClient();
      const { patch } = instance.createMethods();
      const result = await patch("users/1", { email: "new@test.com" });

      expect(mockKyInstance.patch).toHaveBeenCalled();
      expect(result.data).toEqual({ patched: true });
    });
  });

  describe("DELETE request", () => {
    it("maps del to ky.delete", async () => {
      mockKyInstance.delete.mockResolvedValue(mockResponse(null, 204));

      const instance = new HttpClient();
      const { del } = instance.createMethods();
      const result = await del("users/1");

      expect(mockKyInstance.delete).toHaveBeenCalledWith("users/1", expect.any(Object));
      expect(result.status).toBe(204);
    });

    it("passes variables as searchParams for DELETE", async () => {
      mockKyInstance.delete.mockResolvedValue(mockResponse(null, 204));

      const instance = new HttpClient();
      const { del } = instance.createMethods({ variables: { force: "true" } });
      await del("users/1");

      const callOptions = mockKyInstance.delete.mock.calls[0][1];
      expect(callOptions.searchParams).toBeDefined();
    });
  });

  describe("HEAD request", () => {
    it("makes HEAD request", async () => {
      mockKyInstance.head.mockResolvedValue(mockResponse(null, 200));

      const instance = new HttpClient();
      const { head } = instance.createMethods();
      const result = await head("users");

      expect(mockKyInstance.head).toHaveBeenCalledWith("users", expect.any(Object));
      expect(result.status).toBe(200);
    });
  });

  describe("path params", () => {
    it("compiles path params from variables", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({ id: 42 }));

      const instance = new HttpClient();
      const { get } = instance.createMethods({ variables: { id: "42" } });
      await get("users/:id");

      const url = mockKyInstance.get.mock.calls[0][0];
      expect(url).toBe("users/42");
    });
  });

  describe("responseType", () => {
    it("returns text when responseType is text", async () => {
      mockKyInstance.get.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve("plain text response"),
      });

      const instance = new HttpClient({ responseType: "text" });
      const { get } = instance.createMethods();
      const result = await get("data");

      expect(result.data).toBe("plain text response");
    });

    it("handles 204 No Content with json", async () => {
      mockKyInstance.get.mockResolvedValue({
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error("no body")),
      });

      const instance = new HttpClient();
      const { get } = instance.createMethods();
      const result = await get("empty");

      expect(result.status).toBe(204);
      expect(result.data).toBeNull();
    });

    it("handles 204 No Content with text", async () => {
      mockKyInstance.get.mockResolvedValue({
        status: 204,
        headers: new Headers(),
        text: () => Promise.reject(new Error("no body")),
      });

      const instance = new HttpClient({ responseType: "text" });
      const { get } = instance.createMethods();
      const result = await get("empty");

      expect(result.status).toBe(204);
      expect(result.data).toBeNull();
    });

    it("throws HTTPError on json parse failure", async () => {
      mockKyInstance.get.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      });

      const instance = new HttpClient();
      const { get } = instance.createMethods();

      await expect(get("broken")).rejects.toThrow("HTTP 200");
    });
  });

  describe("defaultData and defaultQueryParams", () => {
    it("merges defaultData into POST body", async () => {
      mockKyInstance.post.mockResolvedValue(mockResponse({ ok: true }));

      const instance = new HttpClient({ defaultData: { app: "test" } });
      const { post } = instance.createMethods();
      await post("users", { name: "new" });

      const callOptions = mockKyInstance.post.mock.calls[0][1];
      expect(callOptions.json).toEqual({ app: "test", name: "new" });
    });

    it("merges defaultQueryParams into GET searchParams", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({}));

      const instance = new HttpClient({ defaultQueryParams: { locale: "en" } });
      const { get } = instance.createMethods({ variables: { page: "1" } });
      await get("users");

      const callOptions = mockKyInstance.get.mock.calls[0][1];
      expect(callOptions.searchParams.get("locale")).toBe("en");
      expect(callOptions.searchParams.get("page")).toBe("1");
    });
  });

  describe("bodyEncoder", () => {
    it("uses custom bodyEncoder for POST", async () => {
      mockKyInstance.post.mockResolvedValue(mockResponse({ ok: true }));

      const encoder = vi.fn((obj: Record<string, unknown>) => JSON.stringify(obj));
      const instance = new HttpClient({ bodyEncoder: encoder });
      const { post } = instance.createMethods();
      await post("users", { name: "test" });

      expect(encoder).toHaveBeenCalledWith({ name: "test" });
      const callOptions = mockKyInstance.post.mock.calls[0][1];
      expect(callOptions.body).toBe('{"name":"test"}');
    });
  });

  describe("searchParamsEncoder", () => {
    it("uses custom searchParamsEncoder for GET", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({}));

      const encoder = vi.fn(
        (obj: Record<string, unknown>) => `custom=${Object.keys(obj).join(",")}`,
      );
      const instance = new HttpClient({ searchParamsEncoder: encoder });
      const { get } = instance.createMethods({ variables: { a: "1", b: "2" } });
      await get("users");

      expect(encoder).toHaveBeenCalled();
    });
  });

  describe("stream mode", () => {
    it("returns ReadableStream in data when stream=true", async () => {
      const stream = new ReadableStream();
      mockKyInstance.get.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        body: stream,
      });

      const instance = new HttpClient();
      const { get } = instance.createMethods({ stream: true });
      const result = await get("events");

      expect(result.data).toBe(stream);
      expect(result.status).toBe(200);
    });
  });

  describe("error handling", () => {
    it("converts ky HTTPError to custom HTTPError", async () => {
      const { HTTPError: KyHTTPError } = await import("ky");

      const errorResponse = {
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ error: "not found" }),
        text: () => Promise.resolve('{"error":"not found"}'),
      };

      const kyError = Object.create(KyHTTPError.prototype);
      kyError.response = errorResponse;
      kyError.message = "Request failed with status code 404";

      mockKyInstance.get.mockRejectedValue(kyError);

      const instance = new HttpClient();
      const { get } = instance.createMethods();

      try {
        await get("users/999");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(404);
      }
    });

    it("converts network error to HTTPError with status 0", async () => {
      const networkError = new Error("fetch failed");
      const cause = new Error("ECONNREFUSED");
      (cause as Error & { code: string }).code = "ECONNREFUSED";
      networkError.cause = cause;

      mockKyInstance.get.mockRejectedValue(networkError);

      const instance = new HttpClient();
      const { get } = instance.createMethods();

      try {
        await get("users");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(0);
        expect((error as HTTPError).data).toEqual({
          success: false,
          message: "ECONNREFUSED",
          code: "ECONNREFUSED",
        });
      }
    });

    it("re-throws unknown errors", async () => {
      mockKyInstance.get.mockRejectedValue("string error");

      const instance = new HttpClient();
      const { get } = instance.createMethods();

      await expect(get("users")).rejects.toBe("string error");
    });
  });

  describe("header merging", () => {
    it("passes merged headers to request", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({}));

      const instance = new HttpClient();
      const { get } = instance.createMethods({
        headers: { "content-type": "application/json" },
      });
      await get("users", { headers: new Headers({ authorization: "Bearer token" }) });

      const callOptions = mockKyInstance.get.mock.calls[0][1];
      expect(callOptions.headers).toBeInstanceOf(Headers);
    });
  });

  describe("allowedHeaders", () => {
    it("extends header whitelist with allowedHeaders", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({}));

      const instance = new HttpClient({ allowedHeaders: ["x-custom-header"] });
      const { get } = instance.createMethods();
      await get("users", undefined, { headers: new Headers({ "x-custom-header": "value" }) });

      const callOptions = mockKyInstance.get.mock.calls[0][1];
      expect(callOptions.headers.get("x-custom-header")).toBe("value");
    });
  });

  describe("clearVariables", () => {
    it("removes undefined values from variables in POST", async () => {
      mockKyInstance.post.mockResolvedValue(mockResponse({ ok: true }));

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      await post("users", { name: "test", age: undefined });

      const callOptions = mockKyInstance.post.mock.calls[0][1];
      expect(callOptions.json).toEqual({ name: "test" });
    });
  });

  describe("FormData handling", () => {
    it("removes empty files from FormData", async () => {
      mockKyInstance.post.mockResolvedValue(mockResponse({ ok: true }));

      const fd = new FormData();
      fd.append("name", "test");
      fd.append("avatar", new File([], "empty.png"));
      fd.append("doc", new File(["content"], "doc.pdf"));

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      await post("upload", fd);

      const callOptions = mockKyInstance.post.mock.calls[0][1];
      const body = callOptions.body as FormData;
      expect(body.has("name")).toBe(true);
      expect(body.has("avatar")).toBe(false);
      expect(body.has("doc")).toBe(true);
    });
  });

  describe("baseURL handling", () => {
    it("passes baseURL as prefixUrl to ky", () => {
      new HttpClient({ baseURL: "https://api.example.com" });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ prefixUrl: "https://api.example.com" }),
      );
    });

    it("overrides prefixUrl when URL has absolute basePath", async () => {
      mockKyInstance.get.mockResolvedValue(mockResponse({}));

      const instance = new HttpClient({ baseURL: "https://default.com" });
      const { get } = instance.createMethods();
      await get("https://other.com/api/users");

      const callOptions = mockKyInstance.get.mock.calls[0][1];
      expect(callOptions.prefixUrl).toBe("https://other.com");
    });
  });
});
