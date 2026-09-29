import { afterEach, describe, expect, it, vi } from "vitest";

import { retryOnWin32 } from "../../src/server/project-fs/retry-on-win32";

const REAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    enumerable: true,
  });
}

/** An operation that fails with `code` on its first `failures` calls, then returns "done". */
function failingOperation(code: string, failures: number) {
  const errors: Error[] = [];
  const operation = vi.fn((): string => {
    if (errors.length >= failures) return "done";
    const error = Object.assign(new Error(`attempt ${errors.length + 1}`), { code });
    errors.push(error);
    throw error;
  });
  return { operation, errors };
}

const NOTHING_THROWN = Symbol("nothing thrown");

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

afterEach(() => {
  setPlatform(REAL_PLATFORM);
});

describe("retryOnWin32", () => {
  it("returns what the operation returns when it succeeds at once", () => {
    const { operation } = failingOperation("EBUSY", 0);

    expect(retryOnWin32(operation, "Renaming a file")).toBe("done");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([["EPERM"], ["EACCES"], ["EBUSY"]])(
    "retries %s on Windows until the operation succeeds",
    (code) => {
      setPlatform("win32");
      const { operation } = failingOperation(code, 2);

      const result = retryOnWin32(operation, "Renaming a file");

      expect(result).toBe("done");
      expect(operation).toHaveBeenCalledTimes(3);
    },
  );

  it("waits 50 ms and then 100 ms before the first two retries", () => {
    setPlatform("win32");
    const { operation } = failingOperation("EBUSY", 2);
    const started = performance.now();

    retryOnWin32(operation, "Renaming a file");

    expect(performance.now() - started).toBeGreaterThanOrEqual(145);
  });

  it("throws the last error after five retries on Windows, about 1.5 s later", () => {
    setPlatform("win32");
    const { operation, errors } = failingOperation("EPERM", Number.POSITIVE_INFINITY);
    const started = performance.now();

    const thrown = thrownBy(() => retryOnWin32(operation, "Renaming a file"));

    expect(errors).toHaveLength(6);
    expect(thrown).toBe(errors[5]);
    expect(operation).toHaveBeenCalledTimes(6);
    expect(performance.now() - started).toBeGreaterThanOrEqual(1545);
  });

  it("throws an error Windows does not produce for a held file at once", () => {
    setPlatform("win32");
    const { operation, errors } = failingOperation("ENOENT", 1);

    const thrown = thrownBy(() => retryOnWin32(operation, "Renaming a file"));

    expect(errors).toHaveLength(1);
    expect(thrown).toBe(errors[0]);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([["linux"], ["darwin"]] as const)(
    "throws a busy file's error at once on %s",
    (platform) => {
      setPlatform(platform);
      const { operation, errors } = failingOperation("EBUSY", 1);

      const thrown = thrownBy(() => retryOnWin32(operation, "Renaming a file"));

      expect(errors).toHaveLength(1);
      expect(thrown).toBe(errors[0]);
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );
});
