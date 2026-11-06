import { importFrom } from "./import-address";
import { configObjectPath } from "./project/config-file";
import type { Recipe, RecipeContext } from "./recipes/recipe-types";

/* Where a server's setup writes the list of its APIs, which Studio declares an import in. */
const SERVER_LIST = "src/courier/config.ts";

/**
 * A recipe with the step an import of an address with a secret leaves to
 * the person: Studio writes its code and declares it nowhere, as the list
 * of APIs would keep the secret in the repository. The step names the
 * file the import goes in, its `from` as a template that reads each
 * secret from an environment variable, and the variables to set; the
 * address is shown without the secret, in the plan, the summary and the
 * JSON document alike.
 *
 * @param ctx - The project, and what is set up in it
 * @param recipe - The recipe so far
 * @returns The recipe, with the step where the import's address carries a secret
 * @example
 * ```ts
 * withSecretImport(ctx, recipe).manual.at(-1)?.lines; // ["from: `https://…?api_key=${process.env.SPEC_API_KEY}`,"]
 * ```
 */
export function withSecretImport(ctx: RecipeContext, recipe: Recipe): Recipe {
  const { openapi, name } = ctx.choices;
  if (openapi === undefined || !/^https?:\/\//i.test(openapi) || !URL.canParse(openapi))
    return recipe;
  const from = importFrom(openapi, name);
  if (from.variables.length === 0) return recipe;
  const listed = recipe.files.some((each) => each.path === SERVER_LIST);
  const file =
    ctx.configured !== undefined
      ? configObjectPath(ctx.project)
      : listed
        ? SERVER_LIST
        : "courier.config.ts";
  const what = `Studio writes the import's code and declares it nowhere, as its address carries a secret this file would keep in your repository: add the entry Studio prints, its from as below, and set ${from.variables.join(", ")} in .env.local or the environment Studio runs in`;
  return { ...recipe, manual: [...recipe.manual, { file, what, lines: [from.line] }] };
}
