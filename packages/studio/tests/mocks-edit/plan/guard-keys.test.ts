import { describe, expect, it } from "vitest";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import { guardKeys } from "../../../src/server/mocks-edit/plan/guard-keys";
import type { MockDeclaration } from "../../../src/server/mocks-edit/types";

function request(key: string, source = key): MockDeclaration {
  return { key, source, port: null, seedCount: 20, autoStart: false };
}

function refusal(
  literalKeys: string[],
  requests: MockDeclaration[],
): { code: string; message: string; source: string | null } {
  try {
    guardKeys(literalKeys, requests, "courier.mocks.ts");
  } catch (err) {
    if (err instanceof MocksEditRefusal)
      return { code: err.code, message: err.message, source: err.source };
    throw err;
  }
  throw new Error("guardKeys did not refuse");
}

describe("guardKeys", () => {
  it("accepts new, distinct keys", () => {
    expect(() =>
      guardKeys(["users"], [request("api"), request("billing")], "courier.mocks.ts"),
    ).not.toThrow();
  });

  it("refuses a key the object declares, naming its source", () => {
    expect(refusal(["api"], [request("api", "public-api")])).toEqual({
      code: "INTERNAL_PLAN_REJECTED",
      message: `courier.mocks.ts already declares the mock "api".`,
      source: "public-api",
    });
  });

  it("refuses a key asked for twice", () => {
    expect(refusal([], [request("api"), request("api", "other")])).toEqual({
      code: "INTERNAL_PLAN_REJECTED",
      message: `Studio was asked twice for the mock "api".`,
      source: "other",
    });
  });

  it("refuses no requests at all", () => {
    expect(refusal([], [])).toEqual({
      code: "INTERNAL_PLAN_REJECTED",
      message: "Studio was asked to add no mocks to courier.mocks.ts.",
      source: null,
    });
  });
});
