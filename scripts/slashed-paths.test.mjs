import nodePath from "node:path";
import { describe, expect, it } from "vitest";

import { pathFrom, slashedPath } from "./slashed-paths.mjs";

describe("a path as the checks compare it", () => {
  it("is split by / where Windows writes \\", () => {
    expect(slashedPath("actions\\page.tsx", nodePath.win32)).toBe("actions/page.tsx");
    expect(
      pathFrom("C:\\repo", "C:\\repo\\docs\\src\\content\\docs\\installation.mdx", nodePath.win32),
    ).toBe("docs/src/content/docs/installation.mdx");
  });

  it("is as the system writes it where the system writes /, a \\ in a name kept", () => {
    expect(slashedPath("docs/a\\b.mdx", nodePath.posix)).toBe("docs/a\\b.mdx");
    expect(pathFrom("/repo", "/repo/docs/installation.mdx", nodePath.posix)).toBe(
      "docs/installation.mdx",
    );
  });
});
