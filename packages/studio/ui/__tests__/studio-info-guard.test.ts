/**
 * What Studio tells a page of itself is taken only when it is whole: a
 * version and a project name, both filled, and the time Studio started.
 */
import { describe, expect, it } from "vitest";

import { isStudioInfo } from "@/socket/studio-info-guard";

const INFO = { version: "1.2.3", startedAt: 1_700, project: { name: "acme-web" } };

describe("isStudioInfo", () => {
  it("takes a version, a start time and a project name", () => {
    expect(isStudioInfo(INFO)).toBe(true);
  });

  it("refuses a payload missing, or emptying, any of them", () => {
    for (const data of [
      null,
      "1.2.3",
      { version: "1.2.3", startedAt: 1_700 },
      { ...INFO, version: "" },
      { ...INFO, project: { name: "  " } },
      { ...INFO, version: 1 },
      { ...INFO, project: "acme-web" },
      { version: "1.2.3", project: { name: "acme-web" } },
      { ...INFO, startedAt: "1700" },
      { ...INFO, startedAt: Number.POSITIVE_INFINITY },
      { ...INFO, startedAt: -1 },
    ]) {
      expect(isStudioInfo(data)).toBe(false);
    }
  });
});
