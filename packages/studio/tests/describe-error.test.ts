import { describe, expect, it } from "vitest";

import { describeError } from "../src/server/describe-error";

describe("describeError", () => {
  it("folds a multi-line loader message onto one line, with paths relative to the root", () => {
    const error = new Error("ParseError: Unexpected token  \n /app/courier.mocks.ts:3:2");

    expect(describeError(error, "/app")).toBe("ParseError: Unexpected token courier.mocks.ts:3:2");
  });

  it("keeps paths as they are without a root, and describes what is not an Error", () => {
    expect(describeError(new Error("open /app/x.ts"))).toBe("open /app/x.ts");
    expect(describeError("gone\nfor good")).toBe("gone for good");
  });

  it("describes a thrown value that has no string form by its contents", () => {
    expect(describeError(Object.create(null))).toBe("[Object: null prototype] {}");
  });

  it("leaves a path outside the root whole", () => {
    expect(describeError(new Error("/other/app/x.ts"), "/app")).toBe("/other/app/x.ts");
  });
});
