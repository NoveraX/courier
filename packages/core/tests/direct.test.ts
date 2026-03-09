import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../src/error";
import { createDirectRequest } from "../src/direct/index";

vi.mock("../src/utils/createRequest", () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from "../src/utils/createRequest";

const mockExecuteRequest = vi.mocked(executeRequest);
const mockSources = { api: {} } as any;

afterEach(() => {
  vi.clearAllMocks();
});

describe("createDirectRequest", () => {
  it("returns a curried function", () => {
    const request = createDirectRequest(mockSources) as any;
    expect(typeof request).toBe("function");
    const execute = request("api");
    expect(typeof execute).toBe("function");
  });

  describe("request payload", () => {
    it("builds payload with source and method", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources) as any;
      await request("api")("list");

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          method: "list",
          variables: undefined,
        }),
        undefined,
      );
    });

    it("builds payload with variables", async () => {
      mockExecuteRequest.mockResolvedValue({ id: 1 });

      const request = createDirectRequest(mockSources) as any;
      await request("api")("getUser", { id: 1 });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          method: "getUser",
          variables: { id: 1 },
        }),
        undefined,
      );
    });

    it("parses group:method endpoint key", async () => {
      mockExecuteRequest.mockResolvedValue({ token: "abc" });

      const request = createDirectRequest(mockSources) as any;
      await request("api")("auth:login", { email: "test@test.com" });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          group: "auth",
          method: "login",
          variables: { email: "test@test.com" },
        }),
        undefined,
      );
    });

    it("passes call options to payload", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources) as any;
      await request("api", { rawData: true, timeout: 5000 })("list");

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          options: expect.objectContaining({ rawData: true, timeout: 5000 }),
        }),
        undefined,
      );
    });
  });

  describe("context detection", () => {
    it("detects context with Headers as second arg", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const context = { headers: new Headers({ authorization: "Bearer token" }) };
      const request = createDirectRequest(mockSources) as any;
      await request("api")("list", context);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({ variables: undefined }),
        context,
      );
    });

    it("detects context with Response as second arg", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const context = { res: new Response() };
      const request = createDirectRequest(mockSources) as any;
      await request("api")("list", context);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({ variables: undefined }),
        context,
      );
    });

    it("passes variables and context when both provided", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const context = { headers: new Headers() };
      const request = createDirectRequest(mockSources) as any;
      await request("api")("getUser", { id: 1 }, context);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({ variables: { id: 1 } }),
        context,
      );
    });

    it("treats plain object as variables, not context", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources) as any;
      await request("api")("search", { query: "test" });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({ variables: { query: "test" } }),
        undefined,
      );
    });
  });

  describe("defaults", () => {
    it("applies default timeout when option timeout is undefined", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources, { timeout: 10000 }) as any;
      await request("api")("list");

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(10000);
    });

    it("preserves option timeout over default", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources, { timeout: 10000 }) as any;
      await request("api", { timeout: 5000 })("list");

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(5000);
    });

    it("applies default headers", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources, {
        headers: { "x-api-key": "abc" },
      }) as any;
      await request("api")("list");

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.headers).toEqual({ "x-api-key": "abc" });
    });

    it("merges option headers with default headers", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const request = createDirectRequest(mockSources, {
        headers: { "x-api-key": "abc" },
      }) as any;
      await request("api", { headers: { authorization: "Bearer token" } })("list");

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.headers["x-api-key"]).toBe("abc");
    });
  });

  describe("callbacks", () => {
    it("calls globalOnSuccess after successful request", async () => {
      const data = { users: [] };
      mockExecuteRequest.mockResolvedValue(data);
      const onSuccess = vi.fn();

      const request = createDirectRequest(mockSources, { onSuccess }) as any;
      await request("api")("list");

      expect(onSuccess).toHaveBeenCalledWith(data);
    });

    it("calls globalOnError on HTTPError and re-throws", async () => {
      const httpError = new HTTPError({
        status: 500,
        headers: new Headers(),
        data: { message: "Server Error" },
      });
      mockExecuteRequest.mockRejectedValue(httpError);
      const onError = vi.fn();

      const request = createDirectRequest(mockSources, { onError }) as any;

      await expect(request("api")("fail")).rejects.toThrow();
      expect(onError).toHaveBeenCalledWith(httpError);
    });

    it("does not call globalOnError for non-HTTPError", async () => {
      mockExecuteRequest.mockRejectedValue(new Error("network fail"));
      const onError = vi.fn();

      const request = createDirectRequest(mockSources, { onError }) as any;

      await expect(request("api")("fail")).rejects.toThrow("network fail");
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
