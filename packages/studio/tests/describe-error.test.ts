import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeError } from "../src/server/describe-error";
import { stubOwnEnvironment } from "./helpers/own-environment";

afterEach(() => {
  vi.unstubAllEnvs();
});

/* A path as Windows writes it: its folders apart by backslashes. */
const windows = (path: string): string => path.replaceAll("/", "\\");

describe("describeError", () => {
  it("masks the values of the environment: every page shows the line, and the log writes it", () => {
    const thrown = "cannot reach db.invalid with key FAKE-0000-PROBE-SECRET";
    stubOwnEnvironment({ PROBE_API_KEY: "FAKE-0000-PROBE-SECRET" }, thrown);

    expect(describeError(new Error(thrown))).toBe("cannot reach db.invalid with key [redacted]");
  });

  it("cuts a credential the environment does not hold, and one a variable's value stands in", () => {
    const error = new Error("cannot reach postgres://app:hunter2@db.internal/app");
    stubOwnEnvironment({}, error.message);

    expect(describeError(error)).toBe("cannot reach postgres://db.internal/app");

    /* As GitHub's Windows runner sets it. */
    vi.stubEnv("PGUSER", "postgres");

    expect(describeError(error)).toBe("cannot reach [redacted]://db.internal/app");
  });

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

describe("describeError on Windows, whichever the runner is", () => {
  const PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

  afterEach(() => {
    if (PLATFORM !== undefined) Object.defineProperty(process, "platform", PLATFORM);
  });

  /* Studio reads how its platform spells a path as it loads, so the module is loaded anew on Windows. */
  async function onWindows(): Promise<typeof describeError> {
    Object.defineProperty(process, "platform", { ...PLATFORM, value: "win32" });
    vi.resetModules();
    return (await import("../src/server/describe-error")).describeError;
  }

  it("names a scoped package's file relative to the project, cutting a credential beside it first", async () => {
    const describeOnWindows = await onWindows();
    const root = windows("D:/srv/shop");
    const outside = windows("C:/npm/_npx/4f1c/node_modules/@noverax/courier-cli/bin.js");
    const error = new Error(
      `broken in ${root}${windows("/node_modules/@noverax/courier-mock/index.js")}, required from ${outside} for ana:hunter2@db.internal`,
    );
    stubOwnEnvironment({}, error.message);

    expect(describeOnWindows(error, root)).toBe(
      `broken in node_modules/@noverax/courier-mock/index.js, required from ${outside} for [redacted]@db.internal`,
    );
  });
});
