import { FRAMEWORKS, type Framework } from "./frameworks";
import { projectCode } from "./project/project-code";
import type { Project } from "./project/read-project";
import { isRoutesFramework } from "./recipes/edits/framework-routes";
import type { RoutesMode } from "./recipes/recipe-types";
import { isRoutesModule } from "./routes-setup/routes-modules";

/*
 * A project that writes its routes module already: it has one — beside
 * the config, or where `studio.routes` puts it, as its mark tells — or a
 * script of its runs the CLI that writes it.
 */
function keepsRoutesFile(project: Project): boolean {
  if (project.exists("courier.routes.ts") || project.exists("courier.routes.js")) return true;
  const scripts = Object.values(project.manifest.scripts);
  if (scripts.some((command) => /\bcourier-cli\s+routes\b/.test(command))) return true;
  return projectCode(project).some((file) => isRoutesModule(file.scan.text));
}

/**
 * Whether pages may take their routes from either place, for the person
 * to choose: a framework Courier has a plugin for, in a project that
 * writes no routes module yet.
 *
 * @param project - The project
 * @param framework - Its framework
 * @returns Whether the choice is the person's
 * @example
 * ```ts
 * routesChoice(project, frameworkById("express")); // false: its pages take them from courier.routes.ts
 * ```
 */
export function routesChoice(project: Project, framework: Framework): boolean {
  return isRoutesFramework(framework.id) && !keepsRoutesFile(project);
}

/**
 * What `--routes` asks for: `plugin`, `file`, or nothing.
 *
 * @param asked - The value the command line gave, if any
 * @returns The mode asked for
 * @throws {Error} For any other value
 * @example
 * ```ts
 * routesAsked("file"); // "file"
 * ```
 */
export function routesAsked(asked: string | undefined): RoutesMode | undefined {
  if (asked === undefined || asked === "plugin" || asked === "file") return asked;
  throw new Error(`--routes takes plugin or file, not "${asked}"`);
}

/**
 * Where the pages' proxy clients take their routes from: Courier's plugin
 * for the framework's build, which gives them `@noverax/courier/routes` —
 * unless `--routes file` asks for `courier.routes.ts`, or the project
 * writes that file already — and the file for a framework Courier has no
 * plugin for.
 *
 * @param project - The project
 * @param framework - Its framework
 * @param asked - What `--routes` asks for, if anything
 * @returns The mode
 * @throws {Error} When `--routes plugin` names a framework Courier has no plugin for
 * @example
 * ```ts
 * routesModeOf(project, frameworkById("next"), undefined); // "plugin" in a project without courier.routes.ts
 * ```
 */
export function routesModeOf(
  project: Project,
  framework: Framework,
  asked: RoutesMode | undefined,
): RoutesMode {
  if (!isRoutesFramework(framework.id)) {
    if (asked !== "plugin") return "file";
    const built = FRAMEWORKS.filter((each) => isRoutesFramework(each.id)).map((each) => each.label);
    throw new Error(
      `--routes plugin: Courier builds the routes in with a plugin for ${built.join(", ")}, not for ${framework.label}`,
    );
  }
  if (asked !== undefined) return asked;
  return keepsRoutesFile(project) ? "file" : "plugin";
}
