import { createTerminalStyle } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import type { Plan } from "../../src/plan/build-plan";
import { planLines } from "../../src/plan/plan-lines";

function planWith(otherReleases: Plan["otherReleases"]): Plan {
  return {
    files: [],
    edits: [],
    dependencies: [],
    devDependencies: [],
    otherReleases,
    notInstalled: [],
    typescript: undefined,
    manual: [],
    next: [],
    leftOut: [],
    prepare: [],
  };
}

describe("planLines", () => {
  it("names the upgrade for a package of Courier's on an older line, and this command's latest for a newer one", () => {
    const style = createTerminalStyle(0, false);
    const lines = planLines(
      "Set Courier up in shop",
      planWith([
        { name: "@noverax/courier", has: "0.4.2", wants: "^0.5.0" },
        { name: "@noverax/courier-next", has: "0.6.0", wants: "^0.5.0" },
      ]),
      style,
    );

    expect(lines).toContain(
      "  ! @noverax/courier 0.4.2  kept: the files Courier adds are written for ^0.5.0; npx @noverax/courier-cli@latest upgrade moves the project to it",
    );
    expect(lines).toContain(
      "  ! @noverax/courier-next 0.6.0  kept: the files Courier adds are written for ^0.5.0; npx @noverax/create-courier@latest writes them for the project's",
    );
  });
});
