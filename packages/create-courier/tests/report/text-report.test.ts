import { createTerminalStyle } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import type { Plan } from "../../src/plan/build-plan";
import { textReport } from "../../src/report/text-report";

const PLAN: Plan = {
  files: [{ path: "courier.config.ts", content: "", purpose: "lists your APIs", state: "create" }],
  edits: [],
  dependencies: [],
  devDependencies: [],
  otherReleases: [],
  notInstalled: [],
  typescript: undefined,
  manual: [{ file: "next.config.ts", what: "Wrap the config", lines: ["withCourier(config)"] }],
  next: [{ command: "npm run dev", what: "starts the app" }],
  prepare: [],
};

function reporting() {
  const printed: string[] = [];
  const report = textReport(createTerminalStyle(0, false), (lines) => printed.push(...lines));
  return { printed, report };
}

describe("textReport", () => {
  it("sets a plan apart from what making a new project printed", () => {
    const { printed, report } = reporting();

    report.newProject({
      name: "shop",
      framework: "Next.js",
      how: "npx --yes create-next-app@16 shop",
    });
    report.plan({ title: "Set Courier up in shop", plan: PLAN });

    expect(printed.slice(0, 5)).toEqual([
      "Create shop with Next.js, then set Courier up in it",
      "",
      "  npx --yes create-next-app@16 shop",
      "",
      "",
    ]);
    expect(printed[5]).toBe("Set Courier up in shop");
  });

  it("ends a run that applied the plan with what it says, what is left and what to run", () => {
    const { printed, report } = reporting();

    report.wrote({ written: ["courier.config.ts"], changed: ["package.json"] });
    report.end({ kind: "applied", plan: PLAN, said: "Courier is set up." });

    expect(printed).toEqual([
      "",
      "Wrote 1 file, and changed package.json.",
      "",
      "Courier is set up.",
      "",
      "Left to you",
      "  next.config.ts: Wrap the config",
      "      withCourier(config)",
      "",
      "Next",
      "  npm run dev  starts the app",
    ]);
  });

  it("names the install commands left to run, and prints nothing more for a dry run or failed types", () => {
    const { printed, report } = reporting();

    report.end({ kind: "dry-run" });
    report.end({ kind: "typecheck-failed" });
    report.end({
      kind: "install-left",
      plan: { ...PLAN, manual: [] },
      commands: [["npm", "install", "zod"]],
    });

    expect(printed).toEqual([
      "",
      "Install the packages to finish:",
      "  npm install zod",
      "",
      "Next",
      "  npm run dev  starts the app",
    ]);
  });

  it("shows what an upgrade moves under its title: the ranges, those left and why, and the breaking changes", () => {
    const { printed, report } = reporting();

    report.plan({
      title: "Upgrade Courier in shop",
      plan: { ...PLAN, files: [], manual: [] },
      upgrade: {
        from: "0.4.0",
        to: "0.5.0",
        packages: [
          {
            manifest: "package.json",
            name: "@noverax/courier",
            field: "dependencies",
            from: "^0.4.0",
            to: "^0.5.0",
          },
          {
            manifest: "apps/web/package.json",
            name: "@noverax/courier-react",
            field: "dependencies",
            from: "*",
            to: undefined,
            why: "it allows 0.5.0",
          },
        ],
        notes: [
          {
            release: "0.5.0",
            title: "Call errors",
            docs: "https://courier.noverax.cloud/docs/upgrading#call-errors",
          },
        ],
      },
    });

    expect(printed.slice(0, 9)).toEqual([
      "Upgrade Courier in shop",
      "",
      "Courier 0.4.0 → 0.5.0",
      "  ~ @noverax/courier        ^0.4.0 → ^0.5.0",
      "  ! @noverax/courier-react  *  left as written: it allows 0.5.0  apps/web/package.json",
      "",
      "Breaking changes",
      "  0.5.0  Call errors  https://courier.noverax.cloud/docs/upgrading#call-errors",
      "",
    ]);
  });

  it("says why nothing changed, and what to run where there is something", () => {
    const { printed, report } = reporting();

    report.end({ kind: "refused", code: "DECLINED", said: "Nothing was changed." });
    report.end({ kind: "unchanged", said: "Nothing is missing.", next: PLAN.next });

    expect(printed).toEqual([
      "Nothing was changed.",
      "Nothing is missing.",
      "",
      "Next",
      "  npm run dev  starts the app",
    ]);
  });
});
