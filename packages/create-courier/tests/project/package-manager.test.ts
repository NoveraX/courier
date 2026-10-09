import { utimesSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { invokingManager, packageManager, projectManager } from "../../src/project/package-manager";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

describe("invokingManager", () => {
  it("reads the package manager from the user agent it starts commands with", () => {
    expect(invokingManager("pnpm/10.0.0 npm/? node/v22.12.0 darwin arm64")).toBe("pnpm");
    expect(invokingManager("bun/1.2.0")).toBe("bun");
    expect(invokingManager("deno/2.0")).toBeUndefined();
    expect(invokingManager("")).toBeUndefined();
  });
});

describe("projectManager", () => {
  it("goes by the lockfile", () => {
    expect(projectManager(projectWith({ "yarn.lock": "" }), undefined)).toBe("yarn");
  });

  it("takes the invoking package manager among several lockfiles, else the one written last", () => {
    const root = projectWith({ "pnpm-lock.yaml": "", "package-lock.json": "" });
    utimesSync(join(root, "pnpm-lock.yaml"), new Date(2020, 0, 1), new Date(2020, 0, 1));

    expect(projectManager(root, "pnpm")).toBe("pnpm");
    expect(projectManager(root, undefined)).toBe("npm");
  });

  it("finds a workspace's lockfile above the project", () => {
    const root = projectWith({ "bun.lock": "", "apps/web/package.json": "{}" });

    expect(projectManager(join(root, "apps/web"), undefined)).toBe("bun");
  });
});

describe("packageManager", () => {
  it("adds packages, runs scripts and programs the way each manager does", () => {
    expect(packageManager("npm").add(["zod"], true)).toEqual([
      "npm",
      "install",
      "--save-dev",
      "zod",
    ]);
    expect(packageManager("pnpm").add(["zod"], false)).toEqual(["pnpm", "add", "zod"]);
    expect(packageManager("bun").add(["zod"], true)).toEqual(["bun", "add", "-d", "zod"]);
    expect(packageManager("yarn").run("dev")).toBe("yarn dev");
    expect(packageManager("bun").run("dev")).toBe("bun run dev");
    expect(packageManager("npm").exec("astro", ["sync"])).toEqual([
      "npm",
      "exec",
      "--",
      "astro",
      "sync",
    ]);
  });
});
