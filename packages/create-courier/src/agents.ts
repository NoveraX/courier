import type { ManualStep, Recipe, RecipeContext, RecipeFile } from "./recipes/recipe-types";

const MCP_JSON = `{
  "mcpServers": {
    "courier": { "command": "npx", "args": ["@noverax/courier-mcp"] }
  }
}
`;

/* The importer marks no endpoint for agents: which of an API's endpoints agents may call is the person's to say. */
const MARK_IMPORTED: ManualStep = {
  file: "the imported API",
  what: "the MCP server offers only endpoints marked .agent(), and the importer marks none: mark the ones agents may call, on their builders, as the example's reads are",
  lines: ['.agent({ description: "What it answers, for the agent", access: "read" })'],
};

/**
 * A recipe with what offering the API to AI agents adds, when it was
 * asked for: `.mcp.json`, the project's entry for the MCP server, which
 * Claude Code reads — the server started by its package's full name, so
 * npx runs the project's copy and never another package of that name. The
 * example's reads are marked for agents; an imported API's endpoints are
 * left for the person to mark, and the plan says so.
 *
 * @param ctx - The project, and what is set up in it
 * @param recipe - The framework's recipe
 * @returns The recipe, with the agents' entry where asked for
 * @example
 * ```ts
 * withAgents(ctx, nextRecipe(ctx)).files.at(-1)?.path; // ".mcp.json"
 * ```
 */
export function withAgents(ctx: RecipeContext, recipe: Recipe): Recipe {
  if (!ctx.choices.mcp) return recipe;
  const entry: RecipeFile = {
    path: ".mcp.json",
    content: MCP_JSON,
    purpose: "the MCP server your editor's agent starts",
  };
  const imported = ctx.choices.openapi !== undefined;
  return {
    ...recipe,
    files: [...recipe.files, entry],
    manual: imported ? [...recipe.manual, MARK_IMPORTED] : recipe.manual,
    next: [
      ...recipe.next,
      {
        command: "",
        what: imported
          ? "Your editor's agent can call the endpoints you mark .agent(): Claude Code reads .mcp.json"
          : "Your editor's agent can call the API's reads: Claude Code reads .mcp.json",
      },
    ],
  };
}
