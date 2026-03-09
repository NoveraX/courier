import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../src/error";
import { HttpClient } from "../src/http-client/index";

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchResponse(data: unknown, status = 200, headers = new Headers()) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

function textResponse(text: string, status = 200) {
  return new Response(text, { status });
}

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(mockFetchResponse({}));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getFetchCall(index = 0) {
  const [url, options] = fetchSpy.mock.calls[index] || [];
  return { url: url as string, options: options as RequestInit & Record<string, unknown> };
}

describe("HttpClient", () => {
  describe("constructor", () => {
    it("stores baseURL and prefixes requests", async () => {
      const instance = new HttpClient({ baseURL: "https://api.example.com" });
      const { get } = instance.createMethods();
      await get("users");
      expect(getFetchCall().url).toBe("https://api.example.com/users");
    });

    it("works without options", async () => {
      const instance = new HttpClient();
      const { get } = instance.createMethods();
      await get("users");
      expect(getFetchCall().url).toBe("users");
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
      fetchSpy.mockResolvedValue(mockFetchResponse(data));

      const instance = new HttpClient();
      const { get } = instance.createMethods();
      const result = await get("users");

      expect(getFetchCall().options.method).toBe("GET");
      expect(getFetchCall().url).toBe("users");
      expect(result.status).toBe(200);
      expect(result.data).toEqual(data);
    });

    it("passes variables as searchParams for GET", async () => {
      const instance = new HttpClient();
      const { get } = instance.createMethods({ variables: { page: "1", limit: "10" } });
      await get("users");

      const { url } = getFetchCall();
      const params = new URL(url, "http://base").searchParams;
      expect(params.get("page")).toBe("1");
      expect(params.get("limit")).toBe("10");
    });
  });

  describe("POST request", () => {
    it("makes POST request with JSON body", async () => {
      const data = { id: 1, name: "test" };
      fetchSpy.mockResolvedValue(mockFetchResponse(data, 201));

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      const result = await post("users", { name: "test" });

      expect(getFetchCall().options.method).toBe("POST");
      expect(result.status).toBe(201);
      expect(result.data).toEqual(data);
    });

    it("sends FormData as body for POST", async () => {
      const fd = new FormData();
      fd.append("file", new Blob(["content"]), "test.txt");

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      await post("upload", fd as unknown as Record<string, unknown>);

      expect(getFetchCall().options.body).toBeInstanceOf(FormData);
    });
  });

  describe("PUT request", () => {
    it("makes PUT request", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ updated: true }));

      const instance = new HttpClient();
      const { put } = instance.createMethods();
      const result = await put("users/1", { name: "updated" });

      expect(getFetchCall().options.method).toBe("PUT");
      expect(result.data).toEqual({ updated: true });
    });
  });

  describe("PATCH request", () => {
    it("makes PATCH request", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse({ patched: true }));

      const instance = new HttpClient();
      const { patch } = instance.createMethods();
      const result = await patch("users/1", { email: "new@test.com" });

      expect(getFetchCall().options.method).toBe("PATCH");
      expect(result.data).toEqual({ patched: true });
    });
  });

  describe("DELETE request", () => {
    it("maps del to DELETE method", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(null, 204));

      const instance = new HttpClient();
      const { del } = instance.createMethods();
      const result = await del("users/1");

      expect(getFetchCall().options.method).toBe("DELETE");
      expect(getFetchCall().url).toBe("users/1");
      expect(result.status).toBe(204);
    });

    it("passes variables as searchParams for DELETE", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(null, 204));

      const instance = new HttpClient();
      const { del } = instance.createMethods({ variables: { force: "true" } });
      await del("users/1");

      const { url } = getFetchCall();
      expect(url).toContain("force=true");
    });
  });

  describe("HEAD request", () => {
    it("makes HEAD request", async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(null, 200));

      const instance = new HttpClient();
      const { head } = instance.createMethods();
      const result = await head("users");

      expect(getFetchCall().options.method).toBe("HEAD");
      expect(result.status).toBe(200);
    });
  });

  describe("path params", () => {
    it("compiles path params from variables", async () => {
      const instance = new HttpClient();
      const { get } = instance.createMethods({ variables: { id: "42" } });
      await get("users/:id");

      const { url } = getFetchCall();
      expect(url).toBe("users/42");
    });
  });

  describe("responseType", () => {
    it("returns text when responseType is text", async () => {
      fetchSpy.mockResolvedValue(textResponse("plain text response"));

      const instance = new HttpClient({ responseType: "text" });
      const { get } = instance.createMethods();
      const result = await get("data");

      expect(result.data).toBe("plain text response");
    });

    it("handles 204 No Content with json", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const instance = new HttpClient();
      const { get } = instance.createMethods();
      const result = await get("empty");

      expect(result.status).toBe(204);
      expect(result.data).toBeNull();
    });

    it("handles 204 No Content with text", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const instance = new HttpClient({ responseType: "text" });
      const { get } = instance.createMethods();
      const result = await get("empty");

      expect(result.status).toBe(204);
      expect(result.data).toBeNull();
    });

    it("throws HTTPError on json parse failure", async () => {
      fetchSpy.mockResolvedValue(textResponse("not valid json"));

      const instance = new HttpClient();
      const { get } = instance.createMethods();

      await expect(get("broken")).rejects.toThrow("HTTP 200");
    });
  });

  describe("defaultBody and defaultQueryParams", () => {
    it("merges defaultBody into POST body", async () => {
      const instance = new HttpClient({ defaultBody: { app: "test" } });
      const { post } = instance.createMethods();
      await post("users", { name: "new" });

      const { options } = getFetchCall();
      expect(JSON.parse(options.body as string)).toEqual({ app: "test", name: "new" });
    });

    it("merges defaultQueryParams into GET searchParams", async () => {
      const instance = new HttpClient({ defaultQueryParams: { locale: "en" } });
      const { get } = instance.createMethods({ variables: { page: "1" } });
      await get("users");

      const { url } = getFetchCall();
      const params = new URL(url, "http://base").searchParams;
      expect(params.get("locale")).toBe("en");
      expect(params.get("page")).toBe("1");
    });
  });

  describe("bodySerializer", () => {
    it("uses custom bodySerializer for POST", async () => {
      const serializer = vi.fn((obj: Record<string, unknown>) => JSON.stringify(obj));
      const instance = new HttpClient({ bodySerializer: serializer });
      const { post } = instance.createMethods();
      await post("users", { name: "test" });

      expect(serializer).toHaveBeenCalledWith({ name: "test" });
      expect(getFetchCall().options.body).toBe('{"name":"test"}');
    });
  });

  describe("searchParamsSerializer", () => {
    it("uses custom searchParamsSerializer.stringify for GET", async () => {
      const serializer = {
        stringify: vi.fn(
          (obj: Record<string, unknown>) => `custom=${Object.keys(obj).join(",")}`,
        ),
        parse: vi.fn((str: string) => Object.fromEntries(new URLSearchParams(str).entries())),
      };
      const instance = new HttpClient({ searchParamsSerializer: serializer });
      const { get } = instance.createMethods({ variables: { a: "1", b: "2" } });
      await get("users");

      expect(serializer.stringify).toHaveBeenCalled();
    });
  });

  describe("responseParser", () => {
    it("uses custom responseParser when provided", async () => {
      const xmlString = "<root><item>test</item></root>";
      fetchSpy.mockResolvedValue(textResponse(xmlString));

      const parser = vi.fn(async (response: Response) => {
        const text = await response.text();
        return { xml: text };
      });

      const instance = new HttpClient({ responseParser: parser });
      const { get } = instance.createMethods();
      const result = await get("data");

      expect(parser).toHaveBeenCalled();
      expect(result.data).toEqual({ xml: xmlString });
    });

    it("responseParser takes priority over responseType", async () => {
      fetchSpy.mockResolvedValue(textResponse("custom"));

      const parser = async (response: Response) => `parsed:${await response.text()}`;
      const instance = new HttpClient({ responseType: "json", responseParser: parser });
      const { get } = instance.createMethods();
      const result = await get("data");

      expect(result.data).toBe("parsed:custom");
    });
  });

  describe("stream mode", () => {
    it("returns ReadableStream in data when stream=true", async () => {
      const stream = new ReadableStream();
      fetchSpy.mockResolvedValue(new Response(stream, { status: 200 }));

      const instance = new HttpClient();
      const { get } = instance.createMethods({ stream: true });
      const result = await get("events");

      expect(result.data).toBeInstanceOf(ReadableStream);
      expect(result.status).toBe(200);
    });
  });

  describe("error handling", () => {
    it("throws HTTPError for non-ok responses", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
      );

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

      fetchSpy.mockRejectedValue(networkError);

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
      fetchSpy.mockRejectedValue("string error");

      const instance = new HttpClient();
      const { get } = instance.createMethods();

      await expect(get("users")).rejects.toBe("string error");
    });
  });

  describe("header merging", () => {
    it("passes merged headers to request", async () => {
      const instance = new HttpClient();
      const { get } = instance.createMethods({
        headers: { "content-type": "application/json" },
      });
      await get("users", { headers: new Headers({ authorization: "Bearer token" }) });

      expect(getFetchCall().options.headers).toBeInstanceOf(Headers);
    });
  });

  describe("allowedHeaders", () => {
    it("extends header whitelist with allowedHeaders", async () => {
      const instance = new HttpClient({ allowedHeaders: ["x-custom-header"] });
      const { get } = instance.createMethods();
      await get("users", undefined, { headers: new Headers({ "x-custom-header": "value" }) });

      const headers = getFetchCall().options.headers as Headers;
      expect(headers.get("x-custom-header")).toBe("value");
    });
  });

  describe("stripUndefined", () => {
    it("removes undefined values from variables in POST", async () => {
      const instance = new HttpClient();
      const { post } = instance.createMethods();
      await post("users", { name: "test", age: undefined });

      const { options } = getFetchCall();
      expect(JSON.parse(options.body as string)).toEqual({ name: "test" });
    });
  });

  describe("FormData handling", () => {
    it("removes empty files from FormData", async () => {
      const fd = new FormData();
      fd.append("name", "test");
      fd.append("avatar", new File([], "empty.png"));
      fd.append("doc", new File(["content"], "doc.pdf"));

      const instance = new HttpClient();
      const { post } = instance.createMethods();
      await post("upload", fd as unknown as Record<string, unknown>);

      const body = getFetchCall().options.body as FormData;
      expect(body.has("name")).toBe(true);
      expect(body.has("avatar")).toBe(false);
      expect(body.has("doc")).toBe(true);
    });
  });

  describe("baseURL handling", () => {
    it("prefixes requests with baseURL", async () => {
      const instance = new HttpClient({ baseURL: "https://api.example.com" });
      const { get } = instance.createMethods();
      await get("users");
      expect(getFetchCall().url).toBe("https://api.example.com/users");
    });

    it("overrides prefixUrl when URL has absolute basePath", async () => {
      const instance = new HttpClient({ baseURL: "https://default.com" });
      const { get } = instance.createMethods();
      await get("https://other.com/api/users");

      expect(getFetchCall().url).toBe("https://other.com/api/users");
    });
  });
});
