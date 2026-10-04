/**
 * What Studio tells a page of itself is taken only when it is whole: a
 * version and a project name, both filled.
 */
import { describe, expect, it } from "vitest";

import { isStudioInfo } from "@/socket/studio-info-guard";

describe("isStudioInfo", () => {
  it("takes a version and a project name", () => {
    expect(isStudioInfo({ version: "1.2.3", project: { name: "acme-web" } })).toBe(true);
  });

  it("refuses a payload missing, or emptying, either", () => {
    for (const data of [
      null,
      "1.2.3",
      { version: "1.2.3" },
      { version: "", project: { name: "acme-web" } },
      { version: "1.2.3", project: { name: "  " } },
      { version: 1, project: { name: "acme-web" } },
      { version: "1.2.3", project: "acme-web" },
    ]) {
      expect(isStudioInfo(data)).toBe(false);
    }
  });
});
