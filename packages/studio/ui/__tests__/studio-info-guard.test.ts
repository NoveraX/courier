/**
 * What Studio tells a page of itself is taken only when it is whole: a
 * version and a project name, both filled, the time Studio started, and
 * the project's dependencies by name.
 */
import { describe, expect, it } from "vitest";

import { isStudioInfo } from "@/socket/studio-info-guard";

const PROJECT = { name: "acme-web", dependencies: ["react", "vite"] };
const INFO = { version: "1.2.3", startedAt: 1_700, project: PROJECT };

describe("isStudioInfo", () => {
  it("takes a version, a start time, a project name and its dependencies", () => {
    expect(isStudioInfo(INFO)).toBe(true);
    expect(isStudioInfo({ ...INFO, project: { ...PROJECT, dependencies: [] } })).toBe(true);
  });

  it("refuses a payload missing, or emptying, any of them", () => {
    for (const data of [
      null,
      "1.2.3",
      { version: "1.2.3", startedAt: 1_700 },
      { ...INFO, version: "" },
      { ...INFO, project: { ...PROJECT, name: "  " } },
      { ...INFO, version: 1 },
      { ...INFO, project: "acme-web" },
      { version: "1.2.3", project: PROJECT },
      { ...INFO, startedAt: "1700" },
      { ...INFO, startedAt: Number.POSITIVE_INFINITY },
      { ...INFO, startedAt: -1 },
      { ...INFO, project: { name: "acme-web" } },
      { ...INFO, project: { ...PROJECT, dependencies: "react" } },
      { ...INFO, project: { ...PROJECT, dependencies: ["react", 7] } },
    ]) {
      expect(isStudioInfo(data)).toBe(false);
    }
  });

  it("takes a public demo, with or without the time it resets", () => {
    expect(isStudioInfo({ ...INFO, demo: {} })).toBe(true);
    expect(isStudioInfo({ ...INFO, demo: { resetsAt: 1_800 } })).toBe(true);
  });

  it("refuses a demo it cannot read", () => {
    for (const demo of [true, "yes", null, { resetsAt: "soon" }, { resetsAt: -1 }]) {
      expect(isStudioInfo({ ...INFO, demo })).toBe(false);
    }
  });
});
