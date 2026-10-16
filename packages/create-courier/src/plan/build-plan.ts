import type {
  ManualStep,
  NextStep,
  Recipe,
  RecipeContext,
  RecipeFile,
} from "../recipes/recipe-types";
import { scriptsEdit } from "./package-scripts";
import { missingPackages, type OtherRelease, otherReleases } from "./planned-packages";
import { keptStep, plannedEdit, plannedFile, typescriptOf } from "./planned-parts";
import { typescriptSixStep } from "./typescript-six";

/** A file of the setup, and what the project already has there. */
export interface PlannedFile extends RecipeFile {
  /**
   * `create` while nothing is there; `same` when it already holds this;
   * `courier` when a file of Courier's is there, written its own way — by an
   * earlier setup, or by hand — which is left as it is; `kept` when another
   * file of the project's is there, and the person is shown what it lacks.
   */
  readonly state: "create" | "same" | "courier" | "kept";
}

/** A change to a file of the project's, worked out against the file as it is now. */
export interface PlannedEdit {
  readonly path: string;
  readonly purpose: string;
  /** `edit` while the file lacks the change; `same` when it holds it already. */
  readonly state: "edit" | "same";
  readonly before: string;
  readonly after: string;
}

/** What setting Courier up does to a project, worked out before anything changes. */
export interface Plan {
  readonly files: readonly PlannedFile[];
  /** The changes the command makes to files of the project's; the others are left to the person. */
  readonly edits: readonly PlannedEdit[];
  /** Packages the project does not list yet. */
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  /** Packages the project has on another release line than the setup's: left as they are, and named. */
  readonly otherReleases: readonly OtherRelease[];
  /**
   * The TypeScript to install: where the project has none — `from` left
   * out — or, in a project this run created, one older than 6.0.
   */
  readonly typescript: { readonly from?: string | undefined; readonly to: string } | undefined;
  readonly manual: readonly ManualStep[];
  readonly next: readonly NextStep[];
  /** Programs of the project's to run once the packages are installed: they write the types the added files read. */
  readonly prepare: NonNullable<Recipe["prepare"]>;
}

/**
 * What setting Courier up does to a project: the recipe's files, each
 * created only where nothing is there — a file of the project's is never
 * replaced, and its part is left to the person instead — the changes to
 * files of the project's that are in a shape the command knows, the
 * packages and scripts it does not have yet, and TypeScript 6.0 where it
 * has none.
 *
 * @param ctx - The project, and what is set up in it
 * @param recipe - What the framework's setup takes
 * @returns The plan
 * @example
 * ```ts
 * buildPlan(ctx, nextRecipe(ctx)).files.filter((file) => file.state === "create");
 * ```
 */
export function buildPlan(ctx: RecipeContext, recipe: Recipe): Plan {
  const { project } = ctx;
  const typescript = typescriptOf(project, ctx.fresh, (specs) => ctx.manager.add(specs, true));
  /* Moving to TypeScript 6 asks for changes in a tsconfig written for an older one. */
  const movesToSix = typescript.install !== undefined || typescript.step !== undefined;
  const tsconfigStep = movesToSix ? typescriptSixStep(project) : undefined;
  const files = recipe.files.map((file) => plannedFile(project, file));
  const edits = [...recipe.edits, ...scriptsEdit(recipe.scripts, recipe.rewrites ?? [])].map(
    (edit) => plannedEdit(project, edit),
  );
  return {
    files,
    edits: edits.filter((edit): edit is PlannedEdit => "after" in edit),
    dependencies: missingPackages(project, recipe.dependencies),
    devDependencies: missingPackages(project, recipe.devDependencies),
    otherReleases: otherReleases(project, [...recipe.dependencies, ...recipe.devDependencies]),
    typescript: typescript.install,
    manual: [
      ...files.filter((file) => file.state === "kept").map(keptStep),
      ...edits.filter((edit): edit is ManualStep => "what" in edit),
      ...recipe.manual,
      ...(typescript.step ? [typescript.step] : []),
      ...(tsconfigStep ? [tsconfigStep] : []),
    ],
    next: recipe.next,
    prepare: recipe.prepare ?? [],
  };
}

/**
 * Whether a plan changes anything.
 *
 * @param plan - The plan
 * @returns `false` when Courier is set up as the plan would set it up
 * @example
 * ```ts
 * if (!changesAnything(plan)) console.log("Courier is set up already.");
 * ```
 */
export function changesAnything(plan: Plan): boolean {
  return (
    plan.files.some((file) => file.state === "create") ||
    plan.edits.some((edit) => edit.state === "edit") ||
    plan.dependencies.length > 0 ||
    plan.devDependencies.length > 0 ||
    plan.typescript !== undefined
  );
}
