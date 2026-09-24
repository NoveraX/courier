/**
 * What Studio says when a project has no courier.config.
 *
 * It advised running `courier init`, a command that does not exist.
 */
import { describe, expect, it } from "vitest";

import { ConfigNotFoundError } from "../src/server/config-loader-errors";

describe("a project without a config", () => {
  it("is told how to give it one, with commands that exist", () => {
    const { message } = new ConfigNotFoundError("/work/app");

    expect(message).toContain("courier.config.ts");
    expect(message).toContain("--cwd");
    expect(message).not.toContain("courier init");
  });
});
