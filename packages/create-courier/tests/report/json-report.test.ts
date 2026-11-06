import { describe, expect, it } from "vitest";

import type { Plan } from "../../src/plan/build-plan";
import { jsonReport } from "../../src/report/json-report";

const PLAN: Plan = {
  files: [
    { path: "courier.config.ts", content: "config", purpose: "lists your APIs", state: "create" },
  ],
  edits: [
    {
      path: "package.json",
      purpose: "adds Courier's scripts",
      state: "edit",
      before: '{\n  "scripts": {}\n}\n',
      after: '{\n  "scripts": { "studio": "courier-studio" }\n}\n',
      change: (text) => text,
    },
  ],
  dependencies: ["@noverax/courier@^0.5.0"],
  devDependencies: [],
  otherReleases: [],
  notInstalled: [],
  typescript: undefined,
  manual: [],
  next: [{ command: "npm run dev", what: "starts the app" }],
  prepare: [],
};

function documentOf(report: ReturnType<typeof jsonReport>, exitCode: number): unknown {
  return JSON.parse(report.document(exitCode));
}

describe("jsonReport", () => {
  it("gives the plan, what was installed and written, and how the run ended, as one document", () => {
    const report = jsonReport("create-courier", "0.5.0");

    report.plan({ title: "Set Courier up in shop", plan: PLAN, git: { kind: "clean" } });
    report.installed([["npm", "install", "@noverax/courier@^0.5.0"]]);
    report.wrote({ written: ["courier.config.ts"], changed: ["package.json"] });
    report.typechecked({ kind: "clean" });
    report.end({ kind: "applied", plan: PLAN, said: "Courier is set up." });

    expect(documentOf(report, 0)).toEqual({
      schemaVersion: 1,
      command: "create-courier",
      version: "0.5.0",
      status: "applied",
      exitCode: 0,
      newProject: null,
      plan: {
        title: "Set Courier up in shop",
        configured: null,
        git: { kind: "clean" },
        files: [{ path: "courier.config.ts", state: "create", purpose: "lists your APIs" }],
        edits: [
          {
            path: "package.json",
            state: "edit",
            purpose: "adds Courier's scripts",
            lines: [
              { sign: "-", line: 2, text: '  "scripts": {}' },
              { sign: "+", line: 2, text: '  "scripts": { "studio": "courier-studio" }' },
            ],
          },
        ],
        packages: {
          dependencies: ["@noverax/courier@^0.5.0"],
          devDependencies: [],
          typescript: null,
          otherReleases: [],
          notInstalled: [],
        },
        manual: [],
        next: [{ command: "npm run dev", what: "starts the app" }],
      },
      notes: [],
      written: ["courier.config.ts"],
      changed: ["package.json"],
      install: { ran: true, commands: [["npm", "install", "@noverax/courier@^0.5.0"]] },
      warnings: [],
      typecheck: { kind: "clean" },
      undone: null,
      error: null,
    });
  });

  it("names the install commands left to run, and is applied", () => {
    const report = jsonReport("create-courier", "0.5.0");

    report.end({ kind: "install-left", plan: PLAN, commands: [["npm", "install", "zod"]] });

    expect(documentOf(report, 0)).toMatchObject({
      status: "applied",
      install: { ran: false, commands: [["npm", "install", "zod"]] },
    });
  });

  it("gives the code and the message of a refusal, a failure and what undoing it did, and of types that do not check", () => {
    const refused = jsonReport("courier-cli setup", "0.5.0");
    const failed = jsonReport("create-courier", "0.5.0");
    const typed = jsonReport("create-courier", "0.5.0");
    const undone = { removed: ["courier.config.ts"], putBack: ["package.json"], kept: [] };

    refused.end({ kind: "refused", code: "GIT_DIRTY", said: "Nothing was changed" });
    failed.end({ kind: "failed", code: "INSTALL_FAILED", said: "npm install failed", undone });
    typed.end({ kind: "typecheck-failed" });

    expect(documentOf(refused, 1)).toMatchObject({
      command: "courier-cli setup",
      status: "refused",
      exitCode: 1,
      error: { code: "GIT_DIRTY", message: "Nothing was changed" },
    });
    expect(documentOf(failed, 1)).toMatchObject({
      status: "failed",
      undone,
      error: { code: "INSTALL_FAILED", message: "npm install failed" },
    });
    expect(documentOf(typed, 1)).toMatchObject({
      status: "failed",
      error: { code: "TYPECHECK_FAILED" },
    });
  });

  it("gives why a run that threw stopped, over how it ended", () => {
    const report = jsonReport("create-courier", "0.5.0");

    report.stopped("refused", "REFUSED", "this project has no tsconfig.json");

    expect(documentOf(report, 1)).toMatchObject({
      status: "refused",
      plan: null,
      error: { code: "REFUSED", message: "this project has no tsconfig.json" },
    });
  });
});
