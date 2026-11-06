import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { SetupFailure } from "../../src/apply/setup-failure";
import { transact } from "../../src/apply/transaction";
import type { Plan } from "../../src/plan/build-plan";
import { packageManager } from "../../src/project/package-manager";
import type { SetupEnd } from "../../src/report/setup-report";
import { textReport } from "../../src/report/text-report";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const FAKE = fileURLToPath(new URL("./fake-package-manager.mjs", import.meta.url));
const BEFORE = '{\n  "dependencies": {\n    "@noverax/courier": "^0.4.0"\n  }\n}\n';
const AFTER = BEFORE.replace("^0.4.0", "^0.5.0");

/* An upgrade's plan: a range raised in package.json, its install after the write. */
const PLAN: Plan = {
  files: [],
  edits: [
    {
      path: "package.json",
      purpose: "raises @noverax/courier",
      state: "edit",
      before: BEFORE,
      after: AFTER,
      change: (text) => (text === BEFORE ? AFTER : undefined),
    },
  ],
  dependencies: [],
  devDependencies: [],
  otherReleases: [],
  notInstalled: [],
  typescript: undefined,
  manual: [],
  next: [],
  leftOut: [],
  prepare: [],
};

function tree(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root).map((name) => [name, readFileSync(join(root, name), "utf8")]),
  );
}

async function upgradeWith(
  root: string,
  behaviour: string,
  afterWrites?: (signal: AbortSignal) => Promise<void>,
) {
  const ends: SetupEnd[] = [];
  const text = textReport(createTerminalStyle(0, false), () => undefined);
  const report = {
    ...text,
    end(end: SetupEnd) {
      ends.push(end);
    },
  };
  const result = await transact(
    {
      root,
      manager: packageManager("npm"),
      plan: PLAN,
      install: { when: "after", commands: [[process.execPath, FAKE, behaviour, "prod"]] },
      afterWrites,
    },
    { questions: undefined, report, toolOutput: "stdout" },
  );
  return { result, end: ends.at(-1) };
}

describe("transact, installing after the writes", () => {
  it("writes package.json first, so the install reads the ranges the plan raised", async () => {
    const root = projectWith({ "package.json": BEFORE, "package-lock.json": "{}\n" });

    const { result } = await upgradeWith(root, "lock");

    expect(result).toEqual({ written: [], changed: ["package.json"] });
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(AFTER);
    expect(JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))).toEqual({
      lockfileVersion: 3,
      listed: { "@noverax/courier": "^0.5.0" },
    });
  });

  it("keeps package.json someone changed after the install, and names it once, when a later step fails", async () => {
    const root = projectWith({ "package.json": BEFORE, "package-lock.json": "{}\n" });
    const theirs = AFTER.replace("{\n", '{\n  "private": true,\n');

    const { result, end } = await upgradeWith(root, "lock", async () => {
      writeFileSync(join(root, "package.json"), theirs);
      throw new SetupFailure("IMPORT_FAILED", "A later step failed");
    });

    expect(result).toBe(1);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(theirs);
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toBe("{}\n");
    expect(end).toMatchObject({
      kind: "failed",
      undone: {
        putBack: ["package-lock.json"],
        kept: [{ path: "package.json", why: expect.stringContaining("changed since") }],
      },
    });
  });

  it("puts package.json and the lockfile back as they were when the install fails", async () => {
    const root = projectWith({ "package.json": BEFORE, "package-lock.json": "{}\n" });
    const before = tree(root);

    const { result, end } = await upgradeWith(root, "fail-after-writing");

    expect(result).toBe(1);
    expect(end).toMatchObject({
      kind: "failed",
      code: "INSTALL_FAILED",
      undone: { putBack: expect.arrayContaining(["package.json", "package-lock.json"]) },
    });
    expect(tree(root)).toEqual(before);
  });
});
