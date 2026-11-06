/**
 * The routes' setup that `courier-cli setup` runs, on a project
 * create-courier set up with `--routes file`: its plan, and the project it
 * leaves — the plugin in the build's config, the client on the plugin's
 * routes, Studio kept from writing courier.routes.ts again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { FileJournal } from "../src/apply/file-journal";
import { writePlan } from "../src/apply/write-plan";
import { frameworkById } from "../src/frameworks";
import { buildPlan } from "../src/plan/build-plan";
import { textReport } from "../src/report/text-report";
import { setUpRoutes } from "../src/set-up-routes";
import { contextOf, manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

const VITE = `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
\tplugins: [sveltekit()]
});
`;

/* Every package the setups install, listed — so only files are left to change. */
const INSTALLED = Object.fromEntries(
  [
    "@noverax/courier",
    "@noverax/courier-sveltekit",
    "@noverax/courier-build",
    "@noverax/courier-cli",
    "@noverax/courier-studio",
    "@noverax/courier-studio-core",
    "@noverax/courier-mock",
    "hono",
    "@hono/node-server",
    "zod",
  ].map((name) => [name, "*"]),
);

/* A SvelteKit app create-courier set up with --routes file, its files and changes written. */
function fileModeApp(listed: boolean): string {
  const packages = { "@sveltejs/kit": "^3.0.0", svelte: "^5.57.1", typescript: "^6.0.3" };
  const root = projectWith({
    "package.json": manifest(listed ? { ...packages, ...INSTALLED } : packages),
    "tsconfig.json": "{}",
    "vite.config.ts": VITE,
  });
  const ctx = contextOf(root, "@sveltejs/kit", { routes: "file" });
  const recipe = frameworkById("sveltekit").recipe?.(ctx);
  if (recipe === undefined) throw new Error("no recipe");
  const plan = buildPlan(ctx, recipe);
  writePlan(new FileJournal(root), root, plan);
  return root;
}

function terminal() {
  const printed: string[] = [];
  return {
    printed,
    terminal: {
      interactive: false,
      report: textReport(createTerminalStyle(0, false), (lines) => printed.push(...lines)),
    },
  };
}

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

describe("setUpRoutes", () => {
  it("moves a project from courier.routes.ts to the plugin's routes, and has nothing left to do the second time", async () => {
    const root = fileModeApp(true);
    const first = terminal();
    const again = terminal();

    const status = await setUpRoutes(root, { yes: true, install: false }, first.terminal);
    const second = await setUpRoutes(root, { yes: true, install: false }, again.terminal);

    expect(status).toBe(0);
    expect(read(root, "vite.config.ts")).toContain(
      "plugins: [sveltekit(), courierStudio(), courierRoutes()]",
    );
    expect(read(root, "src/lib/courier/caller.ts")).toContain("createProxyCaller(routes.api)");
    expect(read(root, "src/lib/courier/caller.ts")).toContain(
      'import type config from "../../../courier.config";',
    );
    expect(read(root, "courier.config.ts")).toContain("studio: { routes: false }");
    expect(first.printed.join("\n")).toContain(
      "Wrote 0 files, and changed vite.config.ts, src/lib/courier/caller.ts, courier.config.ts.",
    );
    expect(first.printed.join("\n")).toContain(
      "courier.routes.ts: No module takes its routes from here",
    );
    expect(second).toBe(0);
    expect(again.printed.join("\n")).toContain(
      "Nothing here is for the command to change: the steps left to you are above.",
    );
  });

  it("shows the plan, Courier's plugin among its packages, and changes nothing with --dry-run, or without --yes where no one can answer", async () => {
    const root = fileModeApp(false);
    const before = read(root, "src/lib/courier/caller.ts");
    const shown = terminal();
    const asked = terminal();

    const dry = await setUpRoutes(root, { "dry-run": true }, shown.terminal);
    const unanswered = await setUpRoutes(root, {}, asked.terminal);

    expect(dry).toBe(0);
    expect(shown.printed.join("\n")).toContain("~ src/lib/courier/caller.ts");
    expect(shown.printed.join("\n")).toMatch(/\+ @noverax\/courier-build\S* +\(dev\)/);
    expect(unanswered).toBe(1);
    expect(asked.printed.join("\n")).toContain("Nothing was changed: run it again with --yes");
    expect(read(root, "src/lib/courier/caller.ts")).toBe(before);
  });

  it("refuses a framework Courier has no plugin for, and a project whose config declares no API", async () => {
    const express = projectWith({
      "package.json": manifest({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
    });
    const bare = projectWith({
      "package.json": manifest({ "@sveltejs/kit": "^3.0.0" }),
      "tsconfig.json": "{}",
    });

    await expect(setUpRoutes(express, {}, terminal().terminal)).rejects.toThrow(
      "Courier has no plugin for Express's build",
    );
    await expect(setUpRoutes(bare, {}, terminal().terminal)).rejects.toThrow(
      "courier.config.ts declares no API yet",
    );
  });
});
