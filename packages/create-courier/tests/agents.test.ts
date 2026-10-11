import { afterAll, describe, expect, it } from "vitest";

import { withAgents } from "../src/agents";
import { honoRecipe } from "../src/recipes/hono";
import { contextOf, manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

function honoProject(): string {
  return projectWith({
    "package.json": manifest({ hono: "^4.13.13" }, { type: "module" }),
    "tsconfig.json": "{}",
    "src/index.ts": "import { Hono } from 'hono'\n\nconst app = new Hono()\n",
  });
}

describe("withAgents", () => {
  it("adds nothing when agents were not asked for", () => {
    const ctx = contextOf(honoProject(), "hono");
    const recipe = honoRecipe(ctx);

    expect(withAgents(ctx, recipe)).toBe(recipe);
  });

  it("adds the editor's entry for the MCP server and a config that offers agents every read", () => {
    const ctx = contextOf(honoProject(), "hono", { mcp: true });

    const recipe = withAgents(ctx, honoRecipe(ctx));
    const config = recipe.files.find((file) => file.path === "src/courier/config.ts");

    expect(recipe.files.map((file) => file.path)).toContain(".mcp.json");
    expect(config?.content).toContain('  agents: { offer: "reads" },');
    expect(recipe.edits.map((edit) => edit.path)).not.toContain("courier.config.ts");
    expect(recipe.next.at(-1)?.what).toBe(
      "Your editor's agent can call the API's reads, as courier.config.ts offers them: Claude Code reads .mcp.json",
    );
    expect(recipe.manual).toEqual(honoRecipe(ctx).manual);
  });

  it("offers an imported API's reads the same way, with nothing left to mark", () => {
    const ctx = contextOf(honoProject(), "hono", { mcp: true, openapi: "./openapi.json" });

    const recipe = withAgents(ctx, honoRecipe(ctx));

    expect(recipe.files.find((file) => file.path === "src/courier/config.ts")?.content).toContain(
      'agents: { offer: "reads" }',
    );
    expect(recipe.manual.some((step) => step.what.includes(".agent()"))).toBe(false);
  });

  it("adds the policy to the config of a project set up already, where the list is written", () => {
    const root = projectWith({
      "package.json": manifest({ hono: "^4.13.13" }, { type: "module" }),
      "tsconfig.json": "{}",
      "src/index.ts": "import { Hono } from 'hono'\n\nconst app = new Hono()\n",
      "courier.config.ts": 'export { default } from "./src/courier/config";\n',
      "src/courier/config.ts":
        'import { defineConfig } from "@noverax/courier/config";\n\nexport default defineConfig({\n  sources: {},\n});\n',
    });
    const ctx = contextOf(root, "hono", { mcp: true });

    const edit = withAgents(ctx, honoRecipe(ctx)).edits.find(
      (e) => e.path === "src/courier/config.ts",
    );

    expect(edit?.change(ctx.project.read("src/courier/config.ts") ?? "")).toBe(
      'import { defineConfig } from "@noverax/courier/config";\n\nexport default defineConfig({\n  agents: { offer: "reads" },\n  sources: {},\n});\n',
    );
  });
});
