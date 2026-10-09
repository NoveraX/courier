import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { expressRecipe } from "../../src/recipes/express";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("expressRecipe", () => {
  it("mounts Courier's router right after the app is made, before its body parsers", () => {
    const server =
      'import express from "express";\n\nconst app = express();\napp.use(express.json());\n\napp.listen(3000);\n';
    const root = projectWith({
      "package.json": manifest({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
      "src/server.ts": server,
    });
    const ctx = contextOf(root, "express");
    const edit = buildPlan(ctx, expressRecipe(ctx)).edits.find(
      (planned) => planned.path === "src/server.ts",
    );

    expect(edit?.after).toBe(
      'import express from "express";\nimport { courier } from "./courier/routes";\n\nconst app = express();\napp.use(courier);\napp.use(express.json());\n\napp.listen(3000);\n',
    );
  });

  it("leaves the mount to the person where no entry file is found", () => {
    const root = projectWith({
      "package.json": manifest({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
    });
    const ctx = contextOf(root, "express");

    expect(buildPlan(ctx, expressRecipe(ctx)).manual.map((step) => step.what)).toContain(
      "Mount Courier's routes on your Express app, before any body parser",
    );
  });
});
