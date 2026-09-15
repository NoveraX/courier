import { describe, expect, it } from "vitest";
import { HTTPError, isHTTPError } from "../src/errors";

describe("HTTPError", () => {
  it("creates error with status, headers, data", () => {
    const headers = new Headers({ "content-type": "application/json" });
    const error = new HTTPError({
      status: 404,
      headers,
      data: { message: "Not Found" },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HTTPError);
    expect(error.name).toBe("HTTPError");
    expect(error.status).toBe(404);
    expect(error.headers).toBe(headers);
    expect(error.data).toEqual({ message: "Not Found" });
    expect(error.message).toBe("HTTP 404");
  });

  it("works with generic type parameter", () => {
    const error = new HTTPError<{ success: false; message: string }>({
      status: 500,
      headers: new Headers(),
      data: { success: false, message: "Server Error" },
    });

    expect(error.data.success).toBe(false);
    expect(error.data.message).toBe("Server Error");
  });

  it("preserves stack trace", () => {
    const error = new HTTPError({ status: 400, headers: new Headers(), data: null });
    expect(error.stack).toBeDefined();
  });
});

describe("isHTTPError", () => {
  it("returns true for HTTPError instance", () => {
    const error = new HTTPError({ status: 400, headers: new Headers(), data: null });
    expect(isHTTPError(error)).toBe(true);
  });

  it("returns false for regular Error", () => {
    expect(isHTTPError(new Error("test"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isHTTPError(null)).toBe(false);
    expect(isHTTPError(undefined)).toBe(false);
    expect(isHTTPError("string")).toBe(false);
    expect(isHTTPError({ status: 400 })).toBe(false);
  });
});
