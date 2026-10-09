import { mcpJsonEntry } from "./mcp-json-entry";
import type { ManualStep, Recipe, RecipeContext } from "./recipes/recipe-types";

const MARK_LINE = '.agent({ description: "What it answers, for the agent", access: "read" })';

/* The importer marks no endpoint for agents: which of an API's endpoints agents may call is the person's to say. */
const MARK_IMPORTED: ManualStep = {
  file: "the imported API",
  what: "the MCP server offers only endpoints marked .agent(), and the importer marks none: mark the ones agents may call, on their builders, as the example's reads are",
  lines: [MARK_LINE],
};

/* The API file the setup would write, where one of the project's stands instead with no endpoint marked for agents. */
function unmarkedApi(ctx: RecipeContext, recipe: Recipe): ManualStep | undefined {
  const example = recipe.files.find((file) => file.content.includes(".agent({"));
  const there = example === undefined ? undefined : ctx.project.read(example.path);
  if (example === undefined || there === undefined || there.includes(".agent(")) return undefined;
  return {
    file: example.path,
    what: "the MCP server offers only endpoints marked .agent(), and none is marked here: mark the ones agents may call, on their builders",
    lines: [MARK_LINE],
  };
}

/**
 * A recipe with what offering the API to AI agents adds, when it was
 * asked for: the project's entry for the MCP server in `.mcp.json`, which
 * Claude Code reads — a new file, or Courier's server added beside the
 * ones the project's file lists. The example's reads are marked for
 * agents; the endpoints of an imported API, or of an API the project has
 * already, are left for the person to mark, and the plan says so.
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
  const mark = ctx.choices.openapi !== undefined ? MARK_IMPORTED : unmarkedApi(ctx, recipe);
  return {
    ...recipe,
    files: [...recipe.files, ...entry.files],
    edits: [...recipe.edits, ...entry.edits],
    manual: mark === undefined ? recipe.manual : [...recipe.manual, mark],
    next: [
      ...recipe.next,
      {
        command: "",
        what:
          mark === undefined
            ? "Your editor's agent can call the API's reads: Claude Code reads .mcp.json"
            : "Your editor's agent can call the endpoints you mark .agent(): Claude Code reads .mcp.json",
      },
    ],
  };
}
