/**
 * Why the config did not load is told to every page in `config:status` — a
 * page without the project's token too — so it names no path as it is on
 * the machine: one in the project relative to it, any other from `~`.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigNotFoundError } from "../../src/server/config-loader-errors";
import { failureOf } from "../../src/server/project-state/failure-of";

const ROOT = join(homedir(), "work", "shop");

describe("failureOf", () => {
  it("names a path in the project relative to it, and any other under the home directory from ~", () => {
    const error = new Error(
      `Failed to load courier.config: ${join(ROOT, "src", "api.ts")} imports ${join(homedir(), ".npmrc")}`,
    );

    expect(failureOf(error, ROOT, 1).message).toBe(
      "Failed to load courier.config: src/api.ts imports ~/.npmrc",
    );
  });

  it("names the project root itself in words", () => {
    const failure = failureOf(new ConfigNotFoundError(ROOT), ROOT, 1);

    expect(failure.code).toBe("CONFIG_NOT_FOUND");
    expect(failure.message).toMatch(/ in the project root\. Create one there,/);
    expect(failure.message).not.toContain(homedir());
  });
});
