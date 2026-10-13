import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { describeError } from "../src/server/describe-error";

describe("describeError", () => {
  it("folds a multi-line loader message onto one line, with paths relative to the root", () => {
    const error = new Error("ParseError: Unexpected token  \n /app/courier.mocks.ts:3:2");

    expect(describeError(error, "/app")).toBe("ParseError: Unexpected token courier.mocks.ts:3:2");
  });

  it("keeps a path outside the home and temporary directories as it is without a root, and describes what is not an Error", () => {
    expect(describeError(new Error("open /app/x.ts"))).toBe("open /app/x.ts");
    expect(describeError("gone\nfor good")).toBe("gone for good");
  });

  it("describes a thrown value that has no string form by its contents", () => {
    expect(describeError(Object.create(null))).toBe("[Object: null prototype] {}");
  });

  it("names a path under the home directory from ~: every page shows it, one without the token too", () => {
    const error = new Error(`Cannot find module '${join(homedir(), ".npm", "x.js")}'`);

    expect(describeError(error, "/app")).toBe("Cannot find module '~/.npm/x.js'");
  });

  it("names the project root itself in words a sentence reads", () => {
    const error = new Error("No courier.config.ts in /app. Create one there.");

    expect(describeError(error, "/app")).toBe(
      "No courier.config.ts in the project root. Create one there.",
    );
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
