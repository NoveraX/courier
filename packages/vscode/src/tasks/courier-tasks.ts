import * as vscode from "vscode";

import type { CourierProject, CourierProjects } from "../projects/courier-projects";
import { studioCommandFor } from "../projects/courier-projects";

/** The task type Courier contributes. */
export const TASK_TYPE = "courier";

/** The tasks, in the order the Run Task list shows them. */
const COMMANDS = ["studio", "verify", "openapi", "diff", "agents"] as const;
type CourierCommand = (typeof COMMANDS)[number];

/** What each Courier task runs, and what it is for. */
const TASKS: Readonly<
  Record<CourierCommand, { args: readonly string[]; detail: string; background?: true }>
> = {
  studio: { args: [], detail: "Courier Studio, and the mocks it runs", background: true },
  verify: { args: ["verify"], detail: "Check every recorded call against the API as declared now" },
  openapi: {
    args: ["openapi", "--out", "openapi"],
    detail: "Write each source as an OpenAPI document, into openapi/",
  },
  diff: { args: ["diff"], detail: "Report what a change to the API breaks, against origin/main" },
  agents: { args: [], detail: "List what the project offers agents, and why" },
};

/** A Courier task as tasks.json names it. */
interface CourierTaskDefinition extends vscode.TaskDefinition {
  readonly type: typeof TASK_TYPE;
  readonly command: CourierCommand;
  /** The project's folder, relative to the workspace folder; the first project when left out */
  readonly project?: string;
}

/**
 * Courier's tasks for each project of the workspace — Studio, verify,
 * openapi, diff, and the list of what agents are offered — in the Run Task
 * list and for tasks.json, each run from the project's folder: Studio by
 * the project's own script when it has one, the rest by the package's
 * full name, so npx runs the project's own copy.
 *
 * @param projects - The workspace's Courier projects
 * @returns The provider
 * @example
 * ```ts
 * vscode.tasks.registerTaskProvider(TASK_TYPE, createCourierTasks(projects));
 * ```
 */
export function createCourierTasks(projects: CourierProjects): vscode.TaskProvider {
  return {
    async provideTasks() {
      const all = await projects.list();
      const named = all.length > 1;
      const tasks = await Promise.all(
        all.flatMap((project) =>
          COMMANDS.map((command) => taskOf(project, { type: TASK_TYPE, command }, named)),
        ),
      );
      return tasks;
    },
    async resolveTask(task) {
      const definition = definitionOf(task.definition);
      if (!definition) return undefined;
      const all = await projects.list();
      const folder = definition.project;
      const project =
        all.find((each) => folder !== undefined && each.root.endsWith(folder)) ?? all[0];
      return project ? taskOf(project, definition, false) : undefined;
    },
  };
}

async function taskOf(
  project: CourierProject,
  definition: CourierTaskDefinition,
  named: boolean,
): Promise<vscode.Task> {
  const spec = TASKS[definition.command];
  const line =
    definition.command === "studio"
      ? await studioCommandFor(project)
      : definition.command === "agents"
        ? "npx @noverax/courier-mcp --list"
        : ["npx", "@noverax/courier-studio", ...spec.args].join(" ");
  const folder =
    vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.root)) ??
    vscode.TaskScope.Workspace;
  const name = named ? `${definition.command} · ${project.name}` : definition.command;
  const task = new vscode.Task(
    definition,
    folder,
    name,
    TASK_TYPE,
    new vscode.ShellExecution(line, { cwd: project.root }),
  );
  task.detail = spec.detail;
  task.isBackground = spec.background === true;
  if (definition.command === "verify" || definition.command === "diff")
    task.group = vscode.TaskGroup.Test;
  if (definition.command === "openapi") task.group = vscode.TaskGroup.Build;
  return task;
}

/* A task tasks.json names, read as data: its command one of Courier's, its project a folder. */
function definitionOf(definition: vscode.TaskDefinition): CourierTaskDefinition | undefined {
  const command: unknown = definition.command;
  const project: unknown = definition.project;
  const known = COMMANDS.find((each) => each === command);
  if (definition.type !== TASK_TYPE || !known) return undefined;
  return { type: TASK_TYPE, command: known, ...(typeof project === "string" && { project }) };
}
