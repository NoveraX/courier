import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { changedLines } from "../../src/edit/line-diff";
import { buildPlan, changesAnything } from "../../src/plan/build-plan";
import { planLines } from "../../src/plan/plan-lines";
import type { Recipe } from "../../src/recipes/recipe-types";
import { contextOf, manifest, projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const RECIPE: Recipe = {
  files: [
    { path: "courier.config.ts", content: "export default {};\n", purpose: "config" },
    { path: "src/api.ts", content: "export const api = 1;\n", purpose: "api" },
    { path: "src/kept.ts", content: "ours\n", purpose: "a file" },
  ],
  edits: [],
  dependencies: ["@noverax/courier", "zod"],
  devDependencies: ["@noverax/courier-studio"],
  scripts: { studio: "courier-studio" },
  manual: [],
  next: [],
};

describe("buildPlan", () => {
  it("adds a package the project lists as a peer but has not installed, and says why", () => {
    const root = projectWith({
      "package.json": JSON.stringify({
        name: "app",
        dependencies: { typescript: "^6.0.0" },
        peerDependencies: { zod: "^4.0.0" },
      }),
      "tsconfig.json": "{}",
    });
    const plan = buildPlan(contextOf(root, "typescript"), RECIPE);
    const text = planLines("Set Courier up", plan, createTerminalStyle(0, false)).join("\n");

    expect(plan.dependencies).toEqual(["@noverax/courier", "zod"]);
    expect(plan.notInstalled).toEqual(["zod"]);
    expect(text).toContain(
      "! zod  listed as a peer or optional dependency, but not installed: added",
    );
  });

  it("creates what is missing, skips what is there already and keeps a file of the project's", () => {
    const root = projectWith({
      "package.json": manifest({ zod: "^4.0.0", typescript: "^6.0.0" }),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default {};\n",
      "src/kept.ts": "theirs\n",
    });
    const plan = buildPlan(contextOf(root, "zod"), RECIPE);

    expect(plan.files.map((file) => `${file.path}:${file.state}`)).toEqual([
      "courier.config.ts:same",
      "src/api.ts:create",
      "src/kept.ts:kept",
    ]);
    expect(plan.manual[0]?.file).toBe("src/kept.ts");
    expect(plan.dependencies).toEqual(["@noverax/courier"]);
    expect(plan.typescript).toBeUndefined();
    expect(plan.edits.map((edit) => edit.path)).toEqual(["package.json"]);
  });

  it("leaves a file of Courier's the project has already as it is, without listing its lines", () => {
    const root = projectWith({
      "package.json": manifest({ zod: "^4.0.0", typescript: "^6.0.0" }),
      "tsconfig.json": "{}",
      "src/api.ts": 'import { defineApi } from "@noverax/courier/define";\n// the project\'s own\n',
    });
    const plan = buildPlan(contextOf(root, "zod"), RECIPE);

    expect(plan.files.find((file) => file.path === "src/api.ts")?.state).toBe("courier");
    expect(plan.manual.map((step) => step.file)).not.toContain("src/api.ts");
  });

  it("adds TypeScript to a project without it", () => {
    const root = projectWith({
      "package.json": manifest({ nuxt: "^4.6.0" }),
      "tsconfig.json": "{}",
    });

    expect(buildPlan(contextOf(root, "nuxt"), RECIPE).typescript).toEqual({ to: "typescript@^6" });
  });

  it("leaves an existing project's older TypeScript to the person, and moves a new project's", () => {
    const root = projectWith({
      "package.json": manifest({ typescript: "^5.9.3" }),
      "tsconfig.json": "{}",
    });
    const existing = buildPlan(contextOf(root, "typescript"), RECIPE);
    const fresh = buildPlan({ ...contextOf(root, "typescript"), fresh: true }, RECIPE);

    expect(existing.typescript).toBeUndefined();
    expect(existing.manual.at(-1)?.lines).toEqual(["npm install --save-dev typescript@^6"]);
    expect(fresh.typescript).toEqual({ from: "^5.9.3", to: "typescript@^6" });
  });

  it("says what moving to TypeScript 6 asks of a tsconfig written for an older one", () => {
    const root = projectWith({
      "package.json": manifest({ next: "^15.5.0", typescript: "^5.9.3" }),
      "tsconfig.json": `{
        // as an older Next.js project has it
        "compilerOptions": {
          "target": "es5",
          "moduleResolution": "node",
          "baseUrl": ".",
          "paths": { "@/*": ["src/*"] },
          "downlevelIteration": true,
        },
      }`,
    });
    const plan = buildPlan(contextOf(root, "typescript"), RECIPE);
    const step = plan.manual.find((each) => each.file === "tsconfig.json");

    expect(step?.what).toContain(
      'deprecates what tsconfig.json sets: target "es5", moduleResolution "node", baseUrl, downlevelIteration',
    );
    expect(step?.what).toContain('import "swiper/css"');
    expect(step?.lines).toEqual([
      '"moduleResolution": "bundler",',
      '"paths": { "@/*": ["./src/*"] },',
    ]);
  });

  it("asks a server for the resolution Node uses, and reads a base the tsconfig extends", () => {
    const root = projectWith({
      "package.json": manifest({ express: "^5.1.0", typescript: "^5.9.3" }),
      "tsconfig.base.json":
        '{ "compilerOptions": { "moduleResolution": "node10", "baseUrl": "src", "paths": { "~/*": ["*"] } } }',
      "tsconfig.json":
        '{ "extends": "./tsconfig.base.json", "compilerOptions": { "strict": true } }',
    });
    const plan = buildPlan(contextOf(root, "typescript"), RECIPE);

    expect(plan.manual.find((each) => each.file === "tsconfig.json")?.lines).toEqual([
      '"module": "node16",',
      '"paths": { "~/*": ["./src/*"] },',
    ]);
  });

  it("asks nothing of a tsconfig TypeScript 6 takes as it is, nor of a project on it already", () => {
    const clean = projectWith({
      "package.json": manifest({ next: "^15.5.0", typescript: "^5.9.3" }),
      "tsconfig.json": '{ "compilerOptions": { "moduleResolution": "bundler" } }',
    });
    const onSix = projectWith({
      "package.json": manifest({ next: "^15.5.0", typescript: "^6.0.0" }),
      "tsconfig.json":
        '{ "compilerOptions": { "moduleResolution": "node", "ignoreDeprecations": "6.0" } }',
    });

    for (const root of [clean, onSix]) {
      const plan = buildPlan(contextOf(root, "typescript"), RECIPE);
      expect(plan.manual.map((each) => each.file)).not.toContain("tsconfig.json");
    }
  });

  it("edits a package.json written with CRLF where it changes, and keeps its line ends", () => {
    const written = manifest(
      { zod: "^4.0.0", typescript: "^6.0.0" },
      { scripts: { dev: "next dev" } },
    );
    const crlf = written.replace(/\n/g, "\r\n");
    const root = projectWith({ "package.json": crlf, "tsconfig.json": "{}" });

    const edit = buildPlan(contextOf(root, "zod"), RECIPE).edits.find(
      (each) => each.path === "package.json",
    );

    expect(edit?.after.split("\r\n").length).toBe(edit?.after.split("\n").length);
    expect(changedLines(edit?.before ?? "", edit?.after ?? "")).toEqual([
      { sign: "-", line: expect.any(Number), text: '    "dev": "next dev"' },
      { sign: "+", line: expect.any(Number), text: '    "dev": "next dev",' },
      { sign: "+", line: expect.any(Number), text: '    "studio": "courier-studio"' },
    ]);
  });

  it("changes nothing in a project set up already", () => {
    const root = projectWith({
      "package.json": manifest(
        {
          "@noverax/courier": "^1.0.0",
          zod: "^4.0.0",
          "@noverax/courier-studio": "^1.0.0",
          typescript: "^6.0.0",
        },
        { scripts: { studio: "courier-studio" } },
      ),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default {};\n",
      "src/api.ts": "export const api = 1;\n",
      "src/kept.ts": "ours\n",
    });

    expect(changesAnything(buildPlan(contextOf(root, "zod"), RECIPE))).toBe(false);
  });
});

describe("a plan", () => {
  it("lists a file the recipe gives twice once", () => {
    const root = projectWith({
      "package.json": manifest({ typescript: "^6.0.0" }),
      "tsconfig.json": "{}",
    });
    const twice: Recipe = {
      ...RECIPE,
      files: [RECIPE.files[1], RECIPE.files[1]].filter((file) => file !== undefined),
    };

    expect(buildPlan(contextOf(root, "typescript"), twice).files.map((file) => file.path)).toEqual([
      "src/api.ts",
    ]);
  });

  it("says nothing of files where it adds none", () => {
    const root = projectWith({
      "package.json": manifest({ typescript: "^6.0.0" }),
      "tsconfig.json": "{}",
    });
    const plan = buildPlan(contextOf(root, "typescript"), { ...RECIPE, files: [] });

    expect(planLines("Set Courier up", plan, createTerminalStyle(0, false))).not.toContain("Files");
  });
});
