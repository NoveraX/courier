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

  it("adds the editor's entry for the MCP server, and says the agent can call the example's reads", () => {
    const ctx = contextOf(honoProject(), "hono", { mcp: true });

    const recipe = withAgents(ctx, honoRecipe(ctx));

    expect(recipe.files.map((file) => file.path)).toContain(".mcp.json");
    expect(recipe.next.at(-1)?.what).toBe(
      "Your editor's agent can call the API's reads: Claude Code reads .mcp.json",
    );
    expect(recipe.manual.some((step) => step.what.includes(".agent()"))).toBe(false);
  });

  it("leaves an imported API's endpoints for the person to mark, and says so in the plan", () => {
    const ctx = contextOf(honoProject(), "hono", { mcp: true, openapi: "./openapi.json" });

    const recipe = withAgents(ctx, honoRecipe(ctx));

    expect(recipe.files.map((file) => file.path)).toContain(".mcp.json");
    expect(recipe.manual.at(-1)).toMatchObject({
      file: "the imported API",
      lines: ['.agent({ description: "What it answers, for the agent", access: "read" })'],
    });
    expect(recipe.next.at(-1)?.what).toBe(
      "Your editor's agent can call the endpoints you mark .agent(): Claude Code reads .mcp.json",
    );
  });
});
