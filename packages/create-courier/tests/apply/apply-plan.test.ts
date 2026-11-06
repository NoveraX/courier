/**
 * A setup carried out as one transaction, with a package manager of the
 * tests' own that installs, fails or hangs as each case needs: what the
 * project holds after it fails at each step, and after it holds.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { applyPlan } from "../../src/apply/apply-plan";
import type { CreateRun } from "../../src/create-run";
import { buildPlan } from "../../src/plan/build-plan";
import type { PackageManager } from "../../src/project/package-manager";
import { reactViteRecipe } from "../../src/recipes/react-vite";
import type { SetupEnd } from "../../src/report/setup-report";
import { textReport } from "../../src/report/text-report";
import { contextOf, manifest, projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const FAKE = fileURLToPath(new URL("./fake-package-manager.mjs", import.meta.url));

const VITE_CONFIG =
  'import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [react()] });\n';

/* A package manager whose installs behave as the case says. */
function fakeManager(behaviour: string): PackageManager {
  return {
    name: "npm",
    add: (packages, dev) => [process.execPath, FAKE, behaviour, dev ? "dev" : "prod", ...packages],
    run: (script) => `npm run ${script}`,
    exec: (bin, args) => [bin, ...args],
    install: () => ["npm", "install"],
  };
}

function viteApp(): string {
  return projectWith({
    "package.json": manifest({ vite: "^8.3.0", react: "^19.2.0" }, { scripts: { dev: "vite" } }),
    "tsconfig.json": "{}",
    "vite.config.ts": VITE_CONFIG,
  });
}

/* Every folder and file under the root, each file with its bytes. */
function tree(root: string, dir = ""): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(found, { [`${path}/`]: "" }, tree(root, path));
    else found[path] = readFileSync(join(root, path), "base64");
  }
  return found;
}

/* Plan the React app's setup, then carry it out with the package manager given. */
async function setUp(root: string, behaviour: string, run: CreateRun = {}, before?: () => void) {
  const ctx = { ...contextOf(root, "vite"), manager: fakeManager(behaviour) };
  const plan = buildPlan(ctx, reactViteRecipe(ctx));
  before?.();
  const ends: SetupEnd[] = [];
  const printed: string[] = [];
  const text = textReport(createTerminalStyle(0, false), (lines) => printed.push(...lines));
  const report = {
    ...text,
    end(end: SetupEnd) {
      ends.push(end);
      text.end(end);
    },
  };
  const status = await applyPlan(ctx, plan, { yes: true, ...run }, { interactive: false, report });
  return { status, end: ends.at(-1), printed: printed.join("\n") };
}

describe("applyPlan", () => {
  it("installs first, and leaves every file of the project as it was when the install fails", async () => {
    const root = viteApp();
    const before = tree(root);

    const { status, end, printed } = await setUp(root, "fail");

    expect(status).toBe(1);
    expect(end).toMatchObject({ kind: "failed", code: "INSTALL_FAILED" });
    expect(tree(root)).toEqual(before);
    expect(readFileSync(join(root, "vite.config.ts"), "utf8")).toBe(VITE_CONFIG);
    expect(printed).toContain("Nothing was changed: the project is as it was.");
    expect(printed).toContain("Put right what stopped the install, and run the command again.");
  });

  it("puts package.json and the lockfile back where the install wrote them before it failed", async () => {
    const root = viteApp();
    const before = tree(root);

    const { status, printed } = await setUp(root, "fail-after-writing");

    expect(status).toBe(1);
    expect(tree(root)).toEqual(before);
    expect(printed).toContain(
      "Undone, and the project is as it was: removed package-lock.json; put back package.json.",
    );
    expect(printed).toContain("npm install puts it back as the lockfile says");
  });

  it("makes the plan's changes to package.json as the install left it, and keeps both", async () => {
    const root = viteApp();

    const { status, end } = await setUp(root, "ok");
    const written: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    expect(status).toBe(0);
    expect(end).toMatchObject({ kind: "applied" });
    expect(written).toMatchObject({
      scripts: { dev: "vite", studio: "courier-studio" },
      dependencies: { "@noverax/courier-react": expect.any(String), zod: expect.any(String) },
      devDependencies: { "@noverax/courier-studio": expect.any(String) },
    });
    expect(existsSync(join(root, "package-lock.json"))).toBe(true);
    expect(readFileSync(join(root, "vite.config.ts"), "utf8")).toContain("courierStudio()");
  });

  it("stops at a file that appeared after the plan was shown, and undoes the install and the files it wrote", async () => {
    const root = viteApp();
    const before = tree(root);
    const appeared = "<!doctype html>\n<p>yours</p>\n";

    const { status, end } = await setUp(root, "ok", {}, () =>
      writeFileSync(join(root, "courier.html"), appeared),
    );

    expect(status).toBe(1);
    expect(end).toMatchObject({ kind: "failed", code: "FILE_APPEARED" });
    expect(tree(root)).toEqual({
      ...before,
      "courier.html": Buffer.from(appeared).toString("base64"),
    });
  });

  it("undoes the install and every file when the specification's import fails", async () => {
    const root = viteApp();
    const before = tree(root);

    const { status, end } = await setUp(root, "ok", { openapi: "./openapi.json" });

    expect(status).toBe(1);
    expect(end).toMatchObject({ kind: "failed", code: "IMPORT_FAILED" });
    expect(tree(root)).toEqual(before);
  });

  it("undoes an install the person stopped with Ctrl+C, and ends as an interrupted command does", async () => {
    const root = viteApp();
    const before = tree(root);
    const started = join(mkdtempSync(join(tmpdir(), "create-courier-hang-")), "started");

    const running = setUp(root, `hang=${started}`);
    await expect.poll(() => existsSync(started), { timeout: 30_000 }).toBe(true);
    process.emit("SIGINT");
    const { status, end } = await running;

    expect(status).toBe(130);
    expect(end).toMatchObject({ kind: "failed", code: "CANCELLED" });
    expect(tree(root)).toEqual(before);
  });
});
