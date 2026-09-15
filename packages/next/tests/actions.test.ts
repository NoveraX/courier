import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "@noverax/courier";
import type * as CourierModule from "@noverax/courier";

vi.mock("@noverax/courier", async (importOriginal) => {
  const actual = await importOriginal<typeof CourierModule>();
  return {
    ...actual,
    executeRequest: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ authorization: "Bearer test-token" })),
}));

import { executeRequest } from "@noverax/courier";
import { createAction } from "../src/actions";

const mockExecuteRequest = vi.mocked(executeRequest);
const mockSources = { api: { options: {} } } as any;

afterEach(() => {
  vi.clearAllMocks();
});

describe("createAction", () => {
  it("returns a dot-notation client", () => {
    const action = createAction(mockSources, "api") as any;
    expect(typeof action).toBe("object");
    // Group access returns a dual proxy (callable function with property access)
    expect(action.users).toBeDefined();
  });

  describe("request execution", () => {
    it("calls executeRequest with source, group, and method", async () => {
      mockExecuteRequest.mockResolvedValue({ id: 1, name: "Alice" });

      const action = createAction(mockSources, "api") as any;
      await action.users.create({ name: "Alice", email: "alice@example.com" });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          group: "users",
          method: "create",
          variables: { name: "Alice", email: "alice@example.com" },
        }),
        expect.any(Object),
      );
    });

    it("returns data directly", async () => {
      const userData = { id: 1, name: "Alice" };
      mockExecuteRequest.mockResolvedValue(userData);

      const action = createAction(mockSources, "api") as any;
      const result = await action.users.create({ name: "Alice" });

      expect(result).toEqual(userData);
    });

    it("throws errors directly", async () => {
      mockExecuteRequest.mockRejectedValue(
        new HTTPError({ status: 403, headers: new Headers(), data: { message: "Forbidden" } }),
      );

      const action = createAction(mockSources, "api") as any;

      await expect(action.users.create({ name: "Alice" })).rejects.toThrow(HTTPError);
    });

    it("calls endpoints without variables", async () => {
      mockExecuteRequest.mockResolvedValue([]);

      const action = createAction(mockSources, "api") as any;
      await action.users.getAll();

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          group: "users",
          method: "getAll",
        }),
        expect.any(Object),
      );
    });
  });

  describe("header forwarding", () => {
    it("forwards request headers by default", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources, "api") as any;
      await action.users.getAll();

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context).toBeDefined();
      expect(context.headers).toBeInstanceOf(Headers);
      expect(context.headers.get("authorization")).toBe("Bearer test-token");
    });

    it("skips header forwarding when headers: false", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources, "api", { headers: false }) as any;
      await action.users.getAll();

      const context = mockExecuteRequest.mock.calls[0]?.[2];
      expect(context).toBeUndefined();
    });
  });
});
