import { majorOf, type Project } from "../project/read-project";
import type { ManualStep, RecipeEdit, RecipeFile } from "../recipes/recipe-types";
import type { Plan, PlannedEdit, PlannedFile } from "./build-plan";

/**
 * A package's name, without the range a spec may give it.
 *
 * @param spec - `@noverax/courier@^1.4.0`, `zod`
 * @returns The name
 * @example
 * ```ts
 * packageName("@noverax/courier@^1.4.0"); // "@noverax/courier"
 * ```
 */
export function packageName(spec: string): string {
  const at = spec.indexOf("@", 1);
  return at === -1 ? spec : spec.slice(0, at);
}

/**
 * A recipe's file, and what the project has where it goes.
 *
 * @param project - The project
 * @param file - The file
 * @returns It, to create where nothing is there; `same` where the project has it already; `kept` where a file of the project's is there
 * @example
 * ```ts
 * plannedFile(project, { path: "courier.config.ts", content, purpose }).state; // "create"
 * ```
 */
export function plannedFile(project: Project, file: RecipeFile): PlannedFile {
  const there = project.read(file.path);
  if (there === undefined) return { ...file, state: "create" };
  return { ...file, state: there === file.content ? "same" : "kept" };
}

/**
 * The step left to the person where a file of theirs stands in the place
 * of one the setup needs: the lines Courier's would hold.
 *
 * @param file - The file kept
 * @returns The step
 * @example
 * ```ts
 * keptStep(plannedFile(project, file));
 * ```
 */
export function keptStep(file: PlannedFile): ManualStep {
  return {
    file: file.path,
    what: `A file of yours is here, so it was left as it is: Courier's ${file.purpose} would hold`,
    lines: file.content.trimEnd().split("\n"),
  };
}

/**
 * The TypeScript a project needs: Courier's types are checked with 6.0 or
 * later, and the command checks the files it adds with it. A project
 * without TypeScript gets it; a project just created is moved to it; an
 * existing project keeps the TypeScript it has — a new major can ask for
 * changes across its code — and is told how to move when it is ready.
 *
 * @param project - The project
 * @param fresh - Whether the project was created by this run
 * @param add - The command that installs dev dependencies, for the step left to the person
 * @returns The TypeScript to install, or the step left to the person, or nothing where the project's will do
 * @example
 * ```ts
 * typescriptOf(project, false, (specs) => ["npm", "install", "--save-dev", ...specs]);
 * ```
 */
export function typescriptOf(
  project: Project,
  fresh: boolean,
  add: (specs: readonly string[]) => readonly string[],
): { install?: Plan["typescript"]; step?: ManualStep } {
  const to = "typescript@^6";
  if (!project.lists("typescript")) return { install: { to } };
  const major = majorOf(project.version("typescript"));
  if (major === undefined || major >= 6) return {};
  const from = project.shown("typescript") ?? "";
  if (fresh) return { install: { from, to } };
  return {
    step: {
      file: "package.json",
      what: `Courier's types are checked with TypeScript 6.0 or later, and the project has ${from}: move to it when the project is ready to`,
      lines: [add([to]).join(" ")],
    },
  };
}

/**
 * An edit worked out against its file as it is now.
 *
 * @param project - The project
 * @param edit - The edit
 * @returns The edit planned, or its step for the person where the file is not there or not in a shape the edit knows
 * @example
 * ```ts
 * plannedEdit(project, edit); // { path: "vite.config.ts", state: "edit", before, after, … }
 * ```
 */
export function plannedEdit(project: Project, edit: RecipeEdit): PlannedEdit | ManualStep {
  const before = project.read(edit.path);
  const after = before === undefined ? undefined : edit.change(before);
  if (before === undefined || after === undefined) return edit.manual;
  const { path, purpose } = edit;
  return { path, purpose, state: after === before ? "same" : "edit", before, after };
}
