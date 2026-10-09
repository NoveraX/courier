import { describe, expect, it } from "vitest";
import { FRAMEWORKS } from "../../src/frameworks";
import { generatorFor } from "../../src/new-project/generators";

describe("generatorFor", () => {
  it("runs each framework's own generator at the major the setup is checked with, without a question", () => {
    expect(generatorFor("next", "shop", "pnpm")).toEqual({
      args: ["create-next-app@16", "shop", "--yes", "--use-pnpm"],
      install: false,
    });
    expect(generatorFor("sveltekit", "shop", "npm")?.args).toContain("--no-add-ons");
    expect(generatorFor("solid-start", "shop", "npm")?.args).toEqual([
      "create-solid@0.12",
      "shop",
      "--solidstart",
      "--v2",
      "--ts",
      "-t",
      "basic",
    ]);
  });

  it("has a generator for every framework but Express, whose server the command writes", () => {
    const without = FRAMEWORKS.filter(
      (framework) => generatorFor(framework.id, "shop", "npm") === undefined,
    );

    expect(without.map((framework) => framework.id)).toEqual(["express"]);
  });
});
