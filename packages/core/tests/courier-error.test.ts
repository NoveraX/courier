import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  HTTPError,
  isCourierError,
  CourierError,
} from "../src/errors";
import { ValidationError } from "../src/validation";
import { RealtimeError } from "../src/realtime/errors";

describe("CourierError", () => {
  it("stores code, message, and context", () => {
    const err = new CourierError<"FOO">("boom", { code: "FOO", context: { x: 1 } });
    expect(err.message).toBe("boom");
    expect(err.code).toBe("FOO");
    expect(err.context).toEqual({ x: 1 });
    expect(err.name).toBe("CourierError");
    expect(err).toBeInstanceOf(Error);
  });

  it("propagates cause via Error.cause", () => {
    const cause = new Error("inner");
    const err = new CourierError("outer", { code: "X", cause });
    expect(err.cause).toBe(cause);
  });

  it("subclasses inherit name from constructor", () => {
    class MyError extends CourierError<"MY"> {
      constructor() {
        super("test", { code: "MY" });
      }
    }
    expect(new MyError().name).toBe("MyError");
  });
});

describe("isCourierError", () => {
  it("matches every CourierError subclass", () => {
    expect(isCourierError(new CourierError("a", { code: "X" }))).toBe(true);
    expect(isCourierError(new ConfigurationError("PROXY_PATH_INVALID", "x"))).toBe(true);
    expect(
      isCourierError(
        new HTTPError({
          status: 500,
          headers: new Headers(),
          data: null,
        }),
      ),
    ).toBe(true);
    expect(isCourierError(new ValidationError("response", []))).toBe(true);
    expect(isCourierError(new RealtimeError(4400, "x"))).toBe(true);
  });

  it("rejects plain errors and non-errors", () => {
    expect(isCourierError(new Error("plain"))).toBe(false);
    expect(isCourierError("string")).toBe(false);
    expect(isCourierError(null)).toBe(false);
  });
});

describe("legacy errors keep their public API", () => {
  it("ConfigurationError exposes code", () => {
    const err = new ConfigurationError("WS_PATH_NOT_CONFIGURED", "missing ws");
    expect(err.code).toBe("WS_PATH_NOT_CONFIGURED");
    expect(err).toBeInstanceOf(CourierError);
  });

  it("ValidationError exposes issues + target", () => {
    const err = new ValidationError("variables", [{ message: "bad" }]);
    expect(err.target).toBe("variables");
    expect(err.issues).toEqual([{ message: "bad" }]);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("RealtimeError keeps numeric code", () => {
    const err = new RealtimeError(4422, "fail");
    expect(err.code).toBe(4422);
  });
});
