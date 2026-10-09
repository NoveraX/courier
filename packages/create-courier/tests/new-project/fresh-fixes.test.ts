import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { fixFreshProject } from "../../src/new-project/fresh-fixes";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const FASTIFY_TSCONFIG =
  '{\n  "extends": "fastify-tsconfig",\n  "compilerOptions": {\n    "outDir": "dist",\n    "sourceMap": true\n  },\n  "include": ["src/**/*.ts"]\n}\n';

describe("fixFreshProject", () => {
  it("removes the lockfile a template brought for another package manager", () => {
    const root = projectWith({ "pnpm-lock.yaml": "", "package-lock.json": "{}" });

    expect(fixFreshProject(root, "solid-start", "npm")).toEqual([
      "Removed pnpm-lock.yaml, which the template brought for another package manager",
    ]);
    expect(existsSync(join(root, "pnpm-lock.yaml"))).toBe(false);
    expect(existsSync(join(root, "package-lock.json"))).toBe(true);
  });

  it("gives fastify-cli's tsconfig the rootDir TypeScript 6 builds with, once", () => {
    const root = projectWith({ "tsconfig.json": FASTIFY_TSCONFIG });

    const first = fixFreshProject(root, "fastify", "npm");
    const again = fixFreshProject(root, "fastify", "npm");

    expect(first).toEqual([
      'Set "rootDir": "src" in tsconfig.json, which TypeScript 6 asks for to build',
    ]);
    expect(again).toEqual([]);
    expect(readFileSync(join(root, "tsconfig.json"), "utf8")).toContain(
      '"sourceMap": true,\n    "rootDir": "src"\n  },',
    );
  });
});
