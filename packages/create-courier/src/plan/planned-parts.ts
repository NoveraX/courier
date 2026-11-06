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
 * @returns It, to create where nothing is there; `same` where the project has it already; `courier` where a file of Courier's is there, the project's own way — an earlier setup's, or one written by hand; `kept` where another file of the project's is there
 * @example
 * ```ts
 * plannedFile(project, { path: "courier.config.ts", content, purpose }).state; // "create"
 * ```
 */
export function plannedFile(project: Project, file: RecipeFile): PlannedFile {
  const there = project.read(file.path);
  if (there === undefined) return { ...file, state: "create" };
  if (there === file.content) return { ...file, state: "same" };
  const ours = file.recognized ?? there.includes("@noverax/courier");
  return { ...file, state: ours ? "courier" : "kept" };
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
    what: `A file of yours is here, so it was left as it is: Courier's ${file.purpose.replace(/^Courier's /, "")} would hold`,
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
 * The edits worked out against their files as they are now — those of one
 * file one after another, each on the file as the ones before it leave it,
 * so a config that gets two plugins gets both.
 *
 * @param project - The project
 * @param edits - The edits, in the order they are made
 * @returns Each file's edit planned, and the step left to the person for each edit that cannot be made: its file is not there, or not in a shape the edit knows
 * @example
 * ```ts
 * plannedEdits(project, [studioEdit, routesEdit]); // [{ path: "vite.config.ts", state: "edit", before, after, … }]
 * ```
 */
export function plannedEdits(
  project: Project,
  edits: readonly RecipeEdit[],
): Array<PlannedEdit | ManualStep> {
  const paths = [...new Set(edits.map((edit) => edit.path))];
  return paths.flatMap((path) => {
    const before = project.read(path);
    const ofFile = edits.filter((edit) => edit.path === path);
    if (before === undefined) return ofFile.map((edit) => edit.manual);
    let after = before;
    const made: RecipeEdit[] = [];
    const left: ManualStep[] = [];
    for (const edit of ofFile) {
      const changed = changeKeepingLineEnds(after, edit.change);
      if (changed === undefined) left.push(edit.manual);
      else {
        after = changed;
        made.push(edit);
      }
    }
    if (made.length === 0) return left;
    const purpose = made.map((edit) => edit.purpose).join("; ");
    const change = (text: string) =>
      made.reduce<string | undefined>(
        (changed, edit) =>
          changed === undefined ? undefined : changeKeepingLineEnds(changed, edit.change),
        text,
      );
    const state = after === before ? "same" : "edit";
    return [{ path, purpose, state, before, after, change }, ...left];
  });
}

/*
 * An edit made to the file as LF text, and written back with the line ends
 * the file has: a file written on Windows, with CRLF, is then changed only
 * where the edit changes it, rather than on every line.
 */
function changeKeepingLineEnds(
  before: string,
  change: (text: string) => string | undefined,
): string | undefined {
  if (!before.includes("\r\n")) return change(before);
  const after = change(before.replace(/\r\n/g, "\n"));
  return after === undefined ? undefined : after.replace(/\r?\n/g, "\r\n");
}
