import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { addCourier } from "../../src/add-courier";
import { FileJournal } from "../../src/apply/file-journal";
import { writePlan } from "../../src/apply/write-plan";
import { buildPlan, type Plan } from "../../src/plan/build-plan";
import { packagesOfFiles } from "../../src/plan/packages-of-files";
import { reactViteRecipe } from "../../src/recipes/react-vite";
import { courierPackage } from "../../src/recipes/shared/packages";
import { textReport } from "../../src/report/text-report";
import { contextOf, manifest, projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const VITE_CONFIG =
  'import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [react()] });\n';

function reactApp(): string {
  return projectWith({
    "package.json": manifest({ vite: "^8.3.0", react: "^19.2.0" }, { scripts: { dev: "vite" } }),
    "tsconfig.json": "{}",
    "vite.config.ts": VITE_CONFIG,
  });
}

/* Write the setup's files as a run with --no-install leaves them, without installing a thing. */
function writeFilesOnly(root: string): void {
  const ctx = contextOf(root, "vite");
  writePlan(new FileJournal(root), root, buildPlan(ctx, reactViteRecipe(ctx)));
}

/* The plan the command shows for the project now. */
async function planNow(root: string, openapi?: string): Promise<Plan> {
  let shown: Plan | undefined;
  const report = textReport(createTerminalStyle(0, false), () => undefined);
  const run = { "dry-run": true, mcp: false, ...(openapi === undefined ? {} : { openapi }) };
  await addCourier(root, run, {
    interactive: false,
    toolOutput: "stdout",
    report: {
      ...report,
      plan(view) {
        shown = view.plan;
      },
    },
  });
  if (shown === undefined) throw new Error("no plan was shown");
  return shown;
}

describe("the packages Courier's files need", () => {
  it("are installed on a run after one that wrote the files but never installed", async () => {
    const root = reactApp();
    writeFilesOnly(root);

    const again = await planNow(root);

    expect(again.dependencies).toEqual(
      expect.arrayContaining([
        courierPackage("@noverax/courier-react"),
        "@tanstack/react-query",
        "zod",
      ]),
    );
    expect(again.devDependencies).toEqual(
      expect.arrayContaining([
        courierPackage("@noverax/courier-mock"),
        "hono",
        "@hono/node-server",
      ]),
    );
  });

  it("are read from a file of Courier's as the person changed it since", async () => {
    const root = reactApp();
    writeFilesOnly(root);
    writeFileSync(
      join(root, "courier.mocks.ts"),
      'import { defineMocks } from "@noverax/courier-mock";\n// mine\n',
    );

    expect((await planNow(root)).devDependencies).toEqual(
      expect.arrayContaining([courierPackage("@noverax/courier-mock"), "hono"]),
    );
  });

  it("leave out a file of the project's own that stands where one of Courier's goes", () => {
    const needed = packagesOfFiles(
      [
        { path: "src/courier/query.ts", content: 'import "zod";', purpose: "", state: "kept" },
        {
          path: "src/courier/api.ts",
          content: 'import { z } from "zod/v4";',
          purpose: "",
          state: "create",
        },
      ],
      () => 'import { createQueryCaller } from "@noverax/courier-react";',
    );

    expect(needed).toEqual({ dependencies: ["zod"], devDependencies: [] });
  });

  it("leave out the example's packages where the example is not set up", async () => {
    const plan = await planNow(reactApp(), "./openapi.json");

    expect(plan.dependencies).toContain("zod");
    expect(plan.dependencies.join(" ")).not.toContain("courier-react");
    expect(plan.devDependencies.join(" ")).not.toContain("courier-mock");
  });
});
