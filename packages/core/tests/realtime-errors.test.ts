import { describe, expect, it } from "vitest";
import {
  AuthError,
  ConnectionError,
  ForbiddenError,
  fromErrorCode,
  isRealtimeError,
  RateLimitError,
  RealtimeError,
  TimeoutError,
  ValidationError,
} from "../src/realtime/errors";

describe("RealtimeError hierarchy", () => {
  it("RealtimeError has code and message", () => {
    const err = new RealtimeError(4400, "Bad request");
    expect(err.code).toBe(4400);
    expect(err.message).toBe("Bad request");
    expect(err.name).toBe("RealtimeError");
    expect(err).toBeInstanceOf(Error);
  });

  it("ConnectionError defaults to code 1006", () => {
    const err = new ConnectionError("Network lost");
    expect(err.code).toBe(1006);
    expect(err.name).toBe("ConnectionError");
    expect(err).toBeInstanceOf(RealtimeError);
  });

  it("ConnectionError accepts custom statusCode", () => {
    const err = new ConnectionError("Upgrade failed", 502);
    expect(err.code).toBe(502);
    expect(err.statusCode).toBe(502);
  });

  it("AuthError has code 4401", () => {
    const err = new AuthError();
    expect(err.code).toBe(4401);
    expect(err.name).toBe("AuthError");
    expect(err).toBeInstanceOf(RealtimeError);
  });

  it("ForbiddenError has code 4403", () => {
    const err = new ForbiddenError("Not allowed");
    expect(err.code).toBe(4403);
    expect(err.message).toBe("Not allowed");
  });

  it("TimeoutError has code 4408", () => {
    const err = new TimeoutError();
    expect(err.code).toBe(4408);
  });

  it("RateLimitError has code 4429", () => {
    const err = new RateLimitError();
    expect(err.code).toBe(4429);
  });

  it("ValidationError has code 4422", () => {
    const err = new ValidationError("Invalid payload");
    expect(err.code).toBe(4422);
  });
});

describe("isRealtimeError", () => {
  it("returns true for RealtimeError instances", () => {
    expect(isRealtimeError(new RealtimeError(4400, "test"))).toBe(true);
    expect(isRealtimeError(new AuthError())).toBe(true);
    expect(isRealtimeError(new ConnectionError("x"))).toBe(true);
  });

  it("returns false for plain Error and non-errors", () => {
    expect(isRealtimeError(new Error("plain"))).toBe(false);
    expect(isRealtimeError("string")).toBe(false);
    expect(isRealtimeError(null)).toBe(false);
  });
});

describe("fromErrorCode", () => {
  it("maps 4401 to AuthError", () => {
    const err = fromErrorCode(4401, "Token expired");
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toBe("Token expired");
  });

  it("maps 4403 to ForbiddenError", () => {
    const err = fromErrorCode(4403, "Denied");
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it("maps 4408 to TimeoutError", () => {
    expect(fromErrorCode(4408, "Timeout")).toBeInstanceOf(TimeoutError);
  });

  it("maps 4422 to ValidationError", () => {
    expect(fromErrorCode(4422, "Bad")).toBeInstanceOf(ValidationError);
  });

  it("maps 4429 to RateLimitError", () => {
    expect(fromErrorCode(4429, "Slow down")).toBeInstanceOf(RateLimitError);
  });

  it("maps 1000-1999 to ConnectionError", () => {
    const err = fromErrorCode(1006, "Abnormal");
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.code).toBe(1006);
  });

  it("returns generic RealtimeError for unknown codes", () => {
    const err = fromErrorCode(5000, "Internal");
    expect(err).toBeInstanceOf(RealtimeError);
    expect(err.code).toBe(5000);
    expect(err).not.toBeInstanceOf(AuthError);
  });
});
