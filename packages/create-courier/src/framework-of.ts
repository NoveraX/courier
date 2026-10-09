import { detectFramework, FRAMEWORKS, type Framework, frameworkById } from "./frameworks";
import type { Project } from "./project/read-project";

/* What the project is built with, for a refusal to name. */
function builtWith(found: Framework | undefined): string {
  return found === undefined
    ? "lists no framework Courier sets up"
    : `is built with ${found.label}: leave out --framework`;
}

/**
 * The framework to set Courier up with, and its recipe: the one the
 * project's package.json lists, or the one `--framework` names — which
 * must be that one, so a recipe never writes one framework's files into
 * another's project. Listing a framework's package is not enough: a
 * project lists Hono and Vite for its tools too, Studio's mock among them.
 *
 * @param project - The project
 * @param asked - What `--framework` names, if anything
 * @returns The framework, with its recipe
 * @throws {Error} When the project lists no framework the command knows, the one named is not the project's, or its recipe is not in the command yet
 * @example
 * ```ts
 * frameworkOf(readProject("/work/shop"), undefined).label; // "Next.js"
 * ```
 */
export function frameworkOf(
  project: Project,
  asked: string | undefined,
): Framework & Required<Pick<Framework, "recipe">> {
  const framework = asked === undefined ? detectFramework(project) : frameworkById(asked);
  if (framework === undefined) {
    const known = FRAMEWORKS.map((known) => known.label).join(", ");
    throw new Error(
      `No framework Courier sets up was found in package.json; it knows ${known}. Name one with --framework.`,
    );
  }
  const found = asked === undefined ? framework : detectFramework(project);
  if (found?.id !== framework.id) {
    throw new Error(
      `--framework ${asked} sets ${framework.label} up, but this project ${builtWith(found)}`,
    );
  }
  const { recipe } = framework;
  if (recipe === undefined)
    throw new Error(`Setting Courier up in ${framework.label} is not in this command yet`);
  return { ...framework, recipe };
}
