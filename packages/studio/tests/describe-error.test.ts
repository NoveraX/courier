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

  it.runIf(process.platform === "win32")(
    "takes the root off a path on Windows written with either slash or in another case, naming the rest with forward slashes",
    () => {
      const error = new Error("Cannot find d:/proj/src\\api.ts, nor 'D:\\Proj\\src\\gone.ts'");

      expect(describeError(error, "D:\\proj")).toBe("Cannot find src/api.ts, nor 'src/gone.ts'");
    },
  );

  it.runIf(process.platform !== "win32")(
    "keeps a backslash a name holds on macOS and Linux",
    () => {
      expect(describeError(new Error("open /app/a\\b.ts"), "/app")).toBe("open a\\b.ts");
    },
  );
});
