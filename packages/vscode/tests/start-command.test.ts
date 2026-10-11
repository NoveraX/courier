/**
 * How the extension starts Courier Studio for a project: the project's own
 * `studio` script through its package manager when that script runs Courier
 * Studio, and the package by its full name otherwise.
 */
import { describe, expect, it } from "vitest";

import { packageManagerOf, studioCommand } from "../src/projects/start-command";

describe("the command that starts Studio", () => {
  it("runs the project's studio script through the package manager its lockfile names", () => {
    expect(studioCommand("npm", { studio: "courier-studio" })).toBe("npm run studio");
    expect(studioCommand("pnpm", { studio: "courier-studio --port 6290" })).toBe("pnpm run studio");
    expect(studioCommand("yarn", { studio: "courier-studio" })).toBe("yarn studio");
    expect(studioCommand("bun", { studio: "courier-studio" })).toBe("bun run studio");
  });

  it("runs the package by its full name when the project has no studio script of Courier's", () => {
    expect(studioCommand("npm", {})).toBe("npx @noverax/courier-studio");
    expect(studioCommand("pnpm", { studio: "prisma studio" })).toBe("npx @noverax/courier-studio");
    expect(studioCommand("npm", { studio: "my-courier-studio-wrapper" })).toBe(
      "npx @noverax/courier-studio",
    );
  });

  it("takes the package manager from the nearest lockfile, npm when there is none", () => {
    expect(packageManagerOf([["package.json"], ["pnpm-lock.yaml"]])).toBe("pnpm");
    expect(packageManagerOf([["yarn.lock"], ["package-lock.json"]])).toBe("yarn");
    expect(packageManagerOf([["bun.lockb"]])).toBe("bun");
    expect(packageManagerOf([["package.json"], []])).toBe("npm");
  });
});
