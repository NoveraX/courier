import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../src/error";
import { createCaller } from "../src/caller";

vi.mock("../src/utils/execute", () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from "../src/utils/execute";

const mockExecuteRequest = vi.mocked(executeRequest);
const mockSource = { options: { groups: {} } } as any;

afterEach(() => {
  vi.clearAllMocks();
});

describe("createCaller", () => {
  it("returns a proxy object (not a function)", () => {
    const client = createCaller(mockSource);
    expect(typeof client).toBe("object");
  });

  describe("request payload", () => {
    it("builds payload with group and method", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).users.list();

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { _: mockSource },
        expect.objectContaining({
          source: "_",
          group: "users",
          method: "list",
          variables: undefined,
        }),
        undefined,
      );
    });

    it("builds payload with variables", async () => {
      mockExecuteRequest.mockResolvedValue({ id: 1 });

      const client = createCaller(mockSource);
      await (client as any).users.getById({ id: 1 });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { _: mockSource },
        expect.objectContaining({
          group: "users",
          method: "getById",
          variables: { id: 1 },
        }),
        undefined,
      );
    });
  });

  describe(".raw accessor", () => {
    it("passes rawData: true via client.raw.group.method()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).raw.users.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.rawData).toBe(true);
    });

    it("passes rawData: true via client.group.raw.method()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).users.raw.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.rawData).toBe(true);
    });

    it("does not set rawData when .raw is not used", async () => {
      mockExecuteRequest.mockResolvedValue([]);

      const client = createCaller(mockSource);
      await (client as any).users.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.rawData).toBeUndefined();
    });
  });

  describe(".with() options", () => {
    it("passes options from client.with()", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).with({ timeout: 5000 }).users.list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(5000);
    });

    it("passes options from client.group.with()", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).users.with({ timeout: 3000 }).list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(3000);
    });

    it("preserves raw through .with()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).users.raw.with({ timeout: 1000 }).getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(1000);
    });

    it("returns a new proxy (immutable)", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      const fast = (client as any).with({ timeout: 1000 });

      await fast.users.list();
      await (client as any).users.list();

      const fastPayload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      const normalPayload = mockExecuteRequest.mock.calls[1]?.[1] as any;

      expect(fastPayload.options.timeout).toBe(1000);
      expect(normalPayload.options.timeout).toBeUndefined();
    });
  });

  describe("defaults", () => {
    it("applies default timeout when option timeout is undefined", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource, { timeout: 10000 });
      await (client as any).users.list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(10000);
    });

    it("preserves .with() timeout over default", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource, { timeout: 10000 });
      await (client as any).users.with({ timeout: 5000 }).list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(5000);
    });

    it("applies default headers", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource, { headers: { "x-api-key": "abc" } });
      await (client as any).users.list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.headers).toEqual({ "x-api-key": "abc" });
    });

    it("passes context from defaults to executeRequest", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const context = { headers: new Headers({ authorization: "Bearer token" }) };
      const client = createCaller(mockSource, { context });
      await (client as any).users.list();

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { _: mockSource },
        expect.anything(),
        context,
      );
    });
  });

  describe("callbacks", () => {
    it("calls globalOnSuccess after successful request", async () => {
      const data = { users: [] };
      mockExecuteRequest.mockResolvedValue(data);
      const onSuccess = vi.fn();

      const client = createCaller(mockSource, { onSuccess });
      await (client as any).users.list();

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

      const client = createCaller(mockSource, { onError });

      await expect((client as any).users.fail()).rejects.toThrow();
      expect(onError).toHaveBeenCalledWith(httpError);
    });

    it("does not call globalOnError for non-HTTPError", async () => {
      mockExecuteRequest.mockRejectedValue(new Error("network fail"));
      const onError = vi.fn();

      const client = createCaller(mockSource, { onError });

      await expect((client as any).users.fail()).rejects.toThrow("network fail");
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe("flat mode (no groups)", () => {
    it("builds payload with empty group for flat calls", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).healthCheck();

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { _: mockSource },
        expect.objectContaining({
          source: "_",
          group: "",
          method: "healthCheck",
          variables: undefined,
        }),
        undefined,
      );
    });

    it("passes variables in flat call", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).search({ query: "test" });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        { _: mockSource },
        expect.objectContaining({
          group: "",
          method: "search",
          variables: { query: "test" },
        }),
        undefined,
      );
    });
  });

  describe("dual proxy (mixed mode)", () => {
    it("flat call: client.method() sends group=''", async () => {
      mockExecuteRequest.mockResolvedValue("flat-result");

      const client = createCaller(mockSource);
      const result = await (client as any).healthCheck();

      expect(result).toBe("flat-result");
      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
    });

    it("group call: client.group.method() sends correct group", async () => {
      mockExecuteRequest.mockResolvedValue("group-result");

      const client = createCaller(mockSource);
      const result = await (client as any).users.getAll();

      expect(result).toBe("group-result");
      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
    });

    it("same property works as both flat call and group accessor", async () => {
      mockExecuteRequest
        .mockResolvedValueOnce("flat")
        .mockResolvedValueOnce("nested");

      const client = createCaller(mockSource);

      // Flat: client.users() → calls backend("", "users", ...)
      const flatResult = await (client as any).users();
      expect(flatResult).toBe("flat");
      expect(mockExecuteRequest.mock.calls[0]?.[1]).toMatchObject({
        group: "",
        method: "users",
      });

      // Nested: client.users.getAll() → calls backend("users", "getAll", ...)
      const nestedResult = await (client as any).users.getAll();
      expect(nestedResult).toBe("nested");
      expect(mockExecuteRequest.mock.calls[1]?.[1]).toMatchObject({
        group: "users",
        method: "getAll",
      });
    });

    it("client.raw.method() — raw at client level for flat calls", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: "ok" });

      const client = createCaller(mockSource);
      await (client as any).raw.healthCheck();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.rawData).toBe(true);
    });

    it("client.method.raw() — raw at flat method level", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: "ok" });

      const client = createCaller(mockSource);
      await (client as any).healthCheck.raw();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.rawData).toBe(true);
    });

    it("client.with().method() — with at client level for flat calls", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).with({ timeout: 5000 }).healthCheck();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.timeout).toBe(5000);
    });

    it("client.method.with()() — with at flat method level", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).healthCheck.with({ timeout: 3000 })();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.timeout).toBe(3000);
    });

    it("client.method.raw.with()() — chained raw + with on flat method", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: "ok" });

      const client = createCaller(mockSource);
      await (client as any).healthCheck.raw.with({ timeout: 2000 })();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(2000);
    });

    it("client.raw propagates to nested group calls", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).raw.users.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
      expect(payload.options.rawData).toBe(true);
    });

    it("client.with() propagates to nested group calls", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).with({ timeout: 7000 }).users.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
      expect(payload.options.timeout).toBe(7000);
    });
  });

  describe(".with() chaining", () => {
    it("client.with().with() merges options incrementally", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any)
        .with({ timeout: 5000 })
        .with({ headers: { "x-key": "abc" } })
        .users.list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(5000);
      expect(payload.options.headers).toEqual({ "x-key": "abc" });
    });

    it("later .with() overrides earlier values", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any)
        .with({ timeout: 5000 })
        .with({ timeout: 1000 })
        .users.list();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.options.timeout).toBe(1000);
    });

    it("client.with().method.with()() merges at different levels", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      await (client as any)
        .with({ timeout: 5000 })
        .healthCheck.with({ headers: { "x-key": "abc" } })();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.timeout).toBe(5000);
      expect(payload.options.headers).toEqual({ "x-key": "abc" });
    });
  });

  describe(".raw + .with() combinations", () => {
    it("client.raw.with().group.method()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).raw.with({ timeout: 3000 }).users.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(3000);
    });

    it("client.with().raw.group.method()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).with({ timeout: 3000 }).raw.users.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(3000);
    });

    it("client.raw.with().method() — flat raw + with at client level", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: "ok" });

      const client = createCaller(mockSource);
      await (client as any).raw.with({ timeout: 2000 }).healthCheck();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(2000);
    });

    it("client.with().raw.method() — flat with + raw at client level", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: "ok" });

      const client = createCaller(mockSource);
      await (client as any).with({ timeout: 2000 }).raw.healthCheck();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("");
      expect(payload.method).toBe("healthCheck");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(2000);
    });

    it("client.group.raw.with().method()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).users.raw.with({ timeout: 1500 }).getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(1500);
    });

    it("client.group.with().raw.method()", async () => {
      mockExecuteRequest.mockResolvedValue({ status: 200, data: [] });

      const client = createCaller(mockSource);
      await (client as any).users.with({ timeout: 1500 }).raw.getAll();

      const payload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      expect(payload.group).toBe("users");
      expect(payload.method).toBe("getAll");
      expect(payload.options.rawData).toBe(true);
      expect(payload.options.timeout).toBe(1500);
    });
  });

  describe("proxy isolation", () => {
    it("client.raw does not mutate original client", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      const rawClient = (client as any).raw;

      await rawClient.users.getAll();
      await (client as any).users.getAll();

      const rawPayload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      const normalPayload = mockExecuteRequest.mock.calls[1]?.[1] as any;

      expect(rawPayload.options.rawData).toBe(true);
      expect(normalPayload.options.rawData).toBeUndefined();
    });

    it("client.with() does not mutate original client", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const client = createCaller(mockSource);
      const fastClient = (client as any).with({ timeout: 1000 });

      await fastClient.users.getAll();
      await (client as any).users.getAll();

      const fastPayload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      const normalPayload = mockExecuteRequest.mock.calls[1]?.[1] as any;

      expect(fastPayload.options.timeout).toBe(1000);
      expect(normalPayload.options.timeout).toBeUndefined();
    });

    it("method-level .raw does not affect sibling methods", async () => {
      mockExecuteRequest
        .mockResolvedValueOnce({ status: 200, data: "raw" })
        .mockResolvedValueOnce("normal");

      const client = createCaller(mockSource);
      await (client as any).healthCheck.raw();
      await (client as any).search({ q: "test" });

      const rawPayload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      const normalPayload = mockExecuteRequest.mock.calls[1]?.[1] as any;

      expect(rawPayload.options.rawData).toBe(true);
      expect(normalPayload.options.rawData).toBeUndefined();
    });

    it("method-level .with() does not affect sibling methods", async () => {
      mockExecuteRequest
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true });

      const client = createCaller(mockSource);
      await (client as any).healthCheck.with({ timeout: 500 })();
      await (client as any).search({ q: "test" });

      const withPayload = mockExecuteRequest.mock.calls[0]?.[1] as any;
      const normalPayload = mockExecuteRequest.mock.calls[1]?.[1] as any;

      expect(withPayload.options.timeout).toBe(500);
      expect(normalPayload.options.timeout).toBeUndefined();
    });
  });

  describe("proxy safety", () => {
    it("does not trigger thenable detection (await on client itself)", async () => {
      const client = createCaller(mockSource);
      // If 'then' is not handled, this would hang or error
      const result = await Promise.resolve(client);
      expect(result).toBe(client);
    });

    it("JSON.stringify does not throw", () => {
      const client = createCaller(mockSource);
      expect(() => JSON.stringify(client)).not.toThrow();
    });
  });
});
