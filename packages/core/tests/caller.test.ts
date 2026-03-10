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

  describe("proxy safety", () => {
    it("does not trigger thenable detection (await on client itself)", async () => {
      const client = createCaller(mockSource);
      // If 'then' is not handled, this would hang or error
      const result = await Promise.resolve(client);
      expect(result).toBe(client);
    });
  });
});
