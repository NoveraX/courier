import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installCommand } from "../../src/server/mocks-edit/install-command";

const PACKAGES = "@noverax/courier-mock hono @hono/node-server";

let base: string;
let workspace: string;
let project: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "courier-install-command-")));
  workspace = join(base, "workspace");
  project = join(workspace, "apps", "web");
  mkdirSync(project, { recursive: true });
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("installCommand", () => {
  it.each([
    ["package-lock.json", "npm install --save-dev"],
    ["pnpm-lock.yaml", "pnpm add -D"],
    ["yarn.lock", "yarn add -D"],
    ["bun.lock", "bun add -d"],
    ["bun.lockb", "bun add -d"],
  ])("uses the package manager of a %s found in a parent directory", (lockfile, installer) => {
    writeFileSync(join(workspace, lockfile), "");

    expect(installCommand(project)).toBe(`${installer} ${PACKAGES}`);
  });

  it("uses a lockfile in the project directory itself", () => {
    writeFileSync(join(project, "yarn.lock"), "");

    expect(installCommand(project)).toBe(`yarn add -D ${PACKAGES}`);
  });

  it("uses the nearest lockfile when several directories have one", () => {
    writeFileSync(join(workspace, "pnpm-lock.yaml"), "");
    writeFileSync(join(workspace, "apps", "bun.lock"), "");

    expect(installCommand(project)).toBe(`bun add -d ${PACKAGES}`);
  });

  it("prefers package-lock.json when one directory has several lockfiles", () => {
    writeFileSync(join(workspace, "yarn.lock"), "");
    writeFileSync(join(workspace, "pnpm-lock.yaml"), "");
    writeFileSync(join(workspace, "package-lock.json"), "");

    expect(installCommand(project)).toBe(`npm install --save-dev ${PACKAGES}`);
  });

  it("uses npm when no directory up to the file system root has a lockfile", () => {
    expect(installCommand(project)).toBe(`npm install --save-dev ${PACKAGES}`);
  });
});
