import { agentsPolicyEdit } from "./agents-policy-edit";
import { mcpJsonEntry } from "./mcp-json-entry";
import type { Recipe, RecipeContext } from "./recipes/recipe-types";

/**
 * A recipe with what offering the API to AI agents adds, when it was
 * asked for: the project's entry for the MCP server in `.mcp.json`, which
 * Claude Code reads — a new file, or Courier's server added beside the
 * ones the project's file lists — and a config that offers agents every
 * read. A new config is written with it; one the project has already gets
 * it added, unless it says already what agents may call. A write is
 * offered once it is marked `.agent()`.
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
  const entry = mcpJsonEntry(ctx.project);
  const configured = ctx.project.read("courier.config.ts") !== undefined;
  return {
    ...recipe,
    files: [...recipe.files, ...entry.files],
    edits: [
      ...recipe.edits,
      ...entry.edits,
      ...(configured ? [agentsPolicyEdit(ctx.project)] : []),
    ],
    next: [
      ...recipe.next,
      {
        command: "",
        what: "Your editor's agent can call the API's reads, as courier.config.ts offers them: Claude Code reads .mcp.json",
      },
    ],
  };
}
