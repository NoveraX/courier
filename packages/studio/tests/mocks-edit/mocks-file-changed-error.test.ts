import { CourierError } from "@noverax/courier";

import { describe, expect, it } from "vitest";

import { MocksFileChangedError } from "../../src/server/mocks-edit/mocks-file-changed-error";

describe("MocksFileChangedError", () => {
  it("says the file changed on disk while Studio was editing it", () => {
    const error = new MocksFileChangedError("/work/app/courier.mocks.ts");

    expect(error.message).toBe(
      "/work/app/courier.mocks.ts changed on disk while Studio was editing it, so Studio left it as it is.",
    );
  });

  it("is a CourierError with the MOCKS_FILE_CHANGED code and the file's path", () => {
    const error = new MocksFileChangedError("/work/app/courier.mocks.ts");

    expect(error).toBeInstanceOf(CourierError);
    expect(error.code).toBe("MOCKS_FILE_CHANGED");
    expect(error.name).toBe("MocksFileChangedError");
    expect(error.path).toBe("/work/app/courier.mocks.ts");
  });

  it("keeps the error that revealed the change as its cause", () => {
    const cause = Object.assign(new Error("file already exists"), { code: "EEXIST" });

    const error = new MocksFileChangedError("/work/app/courier.mocks.ts", { cause });

    expect(error.cause).toBe(cause);
  });

  it("has no cause when none was given", () => {
    const error = new MocksFileChangedError("/work/app/courier.mocks.ts");

    expect(Object.hasOwn(error, "cause")).toBe(false);
  });
});
