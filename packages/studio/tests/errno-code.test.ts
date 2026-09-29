import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { errnoCode } from "../src/server/errno-code";

describe("errnoCode", () => {
  it("returns the code of a failed file system call", () => {
    let error: unknown;
    try {
      readFileSync(join(tmpdir(), "courier-errno-code-missing", "nothing.ts"));
    } catch (caught) {
      error = caught;
    }

    expect(errnoCode(error)).toBe("ENOENT");
  });

  it("returns the code an error was given", () => {
    const error = Object.assign(new Error("busy"), { code: "EBUSY" });

    expect(errnoCode(error)).toBe("EBUSY");
  });

  it("returns undefined for an error without a code", () => {
    expect(errnoCode(new Error("plain"))).toBeUndefined();
  });

  it("returns undefined for a code that is not a string", () => {
    const error = Object.assign(new Error("closed"), { code: 1006 });

    expect(errnoCode(error)).toBeUndefined();
  });

  it.each([["ENOENT"], [null], [undefined], [42]])(
    "returns undefined for the thrown value %j",
    (value) => {
      expect(errnoCode(value)).toBeUndefined();
    },
  );
});
