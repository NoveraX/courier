import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../src/error";
import { ValidationError } from "../src/validation";

vi.mock("../src/utils/createRequest", () => ({
  executeRequest: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ authorization: "Bearer test-token" })),
}));

import { executeRequest } from "../src/utils/createRequest";
import { createAction } from "../src/next/actions";

const mockExecuteRequest = vi.mocked(executeRequest);
const mockSources = { api: { options: {} } } as any;

afterEach(() => {
  vi.clearAllMocks();
});

describe("createAction", () => {
  it("returns a curried function chain", () => {
    const selectSource = createAction(mockSources);
    expect(typeof selectSource).toBe("function");

    const selectEndpoint = selectSource("api");
    expect(typeof selectEndpoint).toBe("function");

    const action = selectEndpoint("users:create");
    expect(typeof action).toBe("function");
  });

  describe("request execution", () => {
    it("calls executeRequest with source, group, and method", async () => {
      mockExecuteRequest.mockResolvedValue({ id: 1, name: "Alice" });

      const action = createAction(mockSources)("api")("users:create");
      const formData = new FormData();
      formData.set("name", "Alice");

      await action({ data: null, error: null }, formData);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          group: "users",
          method: "create",
          variables: { name: "Alice" },
        }),
        expect.any(Object),
      );
    });

    it("handles endpoint without group", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources)("api")("list");
      await action({ data: null, error: null }, new FormData());

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          source: "api",
          group: undefined,
          method: "list",
        }),
        expect.any(Object),
      );
    });

    it("returns data on success", async () => {
      const userData = { id: 1, name: "Alice" };
      mockExecuteRequest.mockResolvedValue(userData);

      const action = createAction(mockSources)("api")("users:create");
      const result = await action({ data: null, error: null }, new FormData());

      expect(result).toEqual({ data: userData, error: null });
    });
  });

  describe("FormData parsing", () => {
    it("converts FormData to plain object by default", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources)("api")("users:create");
      const formData = new FormData();
      formData.set("name", "Alice");
      formData.set("email", "alice@example.com");

      await action({ data: null, error: null }, formData);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          variables: { name: "Alice", email: "alice@example.com" },
        }),
        expect.any(Object),
      );
    });

    it("passes raw FormData when parse is 'raw'", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources)("api")("files:upload", { parse: "raw" });
      const formData = new FormData();
      formData.set("file", new Blob(["test"]), "test.txt");

      await action({ data: null, error: null }, formData);

      const call = mockExecuteRequest.mock.calls[0];
      const payload = call?.[1] as any;
      expect(payload.variables).toBeInstanceOf(FormData);
    });

    it("uses custom parse function", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const parse = (fd: FormData) => ({
        name: fd.get("name") as string,
        age: Number(fd.get("age")),
      });

      const action = createAction(mockSources)("api")("users:create", { parse });
      const formData = new FormData();
      formData.set("name", "Alice");
      formData.set("age", "30");

      await action({ data: null, error: null }, formData);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        mockSources,
        expect.objectContaining({
          variables: { name: "Alice", age: 30 },
        }),
        expect.any(Object),
      );
    });
  });

  describe("header forwarding", () => {
    it("forwards request headers by default", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources)("api")("users:list");
      await action({ data: null, error: null }, new FormData());

      const context = mockExecuteRequest.mock.calls[0]?.[2] as any;
      expect(context).toBeDefined();
      expect(context.headers).toBeInstanceOf(Headers);
      expect(context.headers.get("authorization")).toBe("Bearer test-token");
    });

    it("skips header forwarding when headers: false", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });

      const action = createAction(mockSources)("api")("users:list", { headers: false });
      await action({ data: null, error: null }, new FormData());

      const context = mockExecuteRequest.mock.calls[0]?.[2];
      expect(context).toBeUndefined();
    });
  });

  describe("revalidation", () => {
    it("calls revalidatePath after success", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });
      const { revalidatePath } = await import("next/cache");

      const action = createAction(mockSources)("api")("users:create", {
        revalidatePath: "/users",
      });
      await action({ data: null, error: null }, new FormData());

      expect(revalidatePath).toHaveBeenCalledWith("/users");
    });

    it("calls revalidatePath with multiple paths", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });
      const { revalidatePath } = await import("next/cache");

      const action = createAction(mockSources)("api")("users:create", {
        revalidatePath: ["/users", "/dashboard"],
      });
      await action({ data: null, error: null }, new FormData());

      expect(revalidatePath).toHaveBeenCalledWith("/users");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("calls revalidateTag after success", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });
      const { revalidateTag } = await import("next/cache");

      const action = createAction(mockSources)("api")("users:create", {
        revalidateTag: "users",
      });
      await action({ data: null, error: null }, new FormData());

      expect(revalidateTag).toHaveBeenCalledWith("users", "default");
    });

    it("calls revalidateTag with multiple tags", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });
      const { revalidateTag } = await import("next/cache");

      const action = createAction(mockSources)("api")("users:create", {
        revalidateTag: ["users", "dashboard"],
      });
      await action({ data: null, error: null }, new FormData());

      expect(revalidateTag).toHaveBeenCalledWith("users", "default");
      expect(revalidateTag).toHaveBeenCalledWith("dashboard", "default");
    });

    it("uses custom cacheProfile for revalidateTag", async () => {
      mockExecuteRequest.mockResolvedValue({ ok: true });
      const { revalidateTag } = await import("next/cache");

      const action = createAction(mockSources)("api")("users:create", {
        revalidateTag: "users",
        cacheProfile: "days",
      });
      await action({ data: null, error: null }, new FormData());

      expect(revalidateTag).toHaveBeenCalledWith("users", "days");
    });

    it("does not revalidate on error", async () => {
      mockExecuteRequest.mockRejectedValue(
        new HTTPError({ status: 500, headers: new Headers(), data: { message: "fail" } }),
      );
      const { revalidatePath } = await import("next/cache");

      const action = createAction(mockSources)("api")("users:create", {
        revalidatePath: "/users",
      });
      await action({ data: null, error: null }, new FormData());

      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("returns ValidationError as ActionState", async () => {
      const issues = [{ message: "Name is required", path: ["name"] }];
      mockExecuteRequest.mockRejectedValue(new ValidationError("variables", issues));

      const action = createAction(mockSources)("api")("users:create");
      const result = await action({ data: null, error: null }, new FormData());

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        message: expect.stringContaining("Validation failed"),
        status: 422,
        issues,
      });
    });

    it("returns HTTPError as ActionState", async () => {
      mockExecuteRequest.mockRejectedValue(
        new HTTPError({
          status: 403,
          headers: new Headers(),
          data: { message: "Forbidden" },
        }),
      );

      const action = createAction(mockSources)("api")("users:create");
      const result = await action({ data: null, error: null }, new FormData());

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        message: "Forbidden",
        status: 403,
      });
    });

    it("extracts HTTP status as message fallback", async () => {
      mockExecuteRequest.mockRejectedValue(
        new HTTPError({
          status: 500,
          headers: new Headers(),
          data: null,
        }),
      );

      const action = createAction(mockSources)("api")("users:create");
      const result = await action({ data: null, error: null }, new FormData());

      expect(result.error?.message).toBe("HTTP 500");
      expect(result.error?.status).toBe(500);
    });

    it("returns generic Error as ActionState", async () => {
      mockExecuteRequest.mockRejectedValue(new Error("Network failure"));

      const action = createAction(mockSources)("api")("users:create");
      const result = await action({ data: null, error: null }, new FormData());

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        message: "Network failure",
      });
    });

    it("handles non-Error throws", async () => {
      mockExecuteRequest.mockRejectedValue("string error");

      const action = createAction(mockSources)("api")("users:create");
      const result = await action({ data: null, error: null }, new FormData());

      expect(result.error?.message).toBe("Unknown error");
    });
  });
});
