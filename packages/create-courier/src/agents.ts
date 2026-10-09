import type { Recipe, RecipeContext, RecipeFile } from "./recipes/recipe-types";

const MCP_JSON = `{
  "mcpServers": {
    "courier": { "command": "npx", "args": ["@noverax/courier-mcp"] }
  }
}
`;

/**
 * A recipe with what offering the API to AI agents adds, when it was
 * asked for: `.mcp.json`, the project's entry for the MCP server, which
 * Claude Code reads — the server started by its package's full name, so
 * npx runs the project's copy and never another package of that name.
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
  return {
    ...recipe,
    files: [...recipe.files, entry],
    next: [
      ...recipe.next,
      {
        command: "",
        what: "Your editor's agent can call the API's reads: Claude Code reads .mcp.json",
      },
    ],
  };
}
