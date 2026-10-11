import * as vscode from "vscode";

import {
  type CourierProject,
  type CourierProjects,
  studioCommandFor,
} from "../projects/courier-projects";

/**
 * Start Courier Studio for a project in a terminal of its own — or show
 * the terminal that already runs it. The project is the one named, else
 * the one of the file in front, else the only one, else the one picked.
 *
 * @param projects - The workspace's Courier projects
 * @param root - The project's folder, when the caller knows it
 * @example
 * ```ts
 * await startStudio(projects, "/work/shop");
 * ```
 */
export async function startStudio(projects: CourierProjects, root?: string): Promise<void> {
  const project = await chooseProject(projects, root);
  if (!project) {
    const answer = await vscode.window.showInformationMessage(
      "No folder in this workspace has a courier.config: set Courier up first.",
      "Set Up Courier",
    );
    if (answer) await setUpCourier();
    return;
  }
  const name = `Courier Studio · ${project.name}`;
  const running = vscode.window.terminals.find(
    (terminal) => terminal.name === name && terminal.exitStatus === undefined,
  );
  if (running) {
    running.show();
    return;
  }
  const terminal = vscode.window.createTerminal({
    name,
    cwd: project.root,
    iconPath: new vscode.ThemeIcon("pulse"),
  });
  terminal.sendText(await studioCommandFor(project));
  terminal.show();
}

/**
 * Set Courier up in a folder of the workspace with create-courier, in a
 * terminal: it shows its plan, and changes nothing until you agree.
 *
 * @example
 * ```ts
 * await setUpCourier();
 * ```
 */
export async function setUpCourier(): Promise<void> {
  const folder = await chooseFolder();
  if (!folder) return;
  const terminal = vscode.window.createTerminal({
    name: "Set Up Courier",
    cwd: folder.uri.fsPath,
    iconPath: new vscode.ThemeIcon("rocket"),
  });
  terminal.sendText("npx @noverax/create-courier");
  terminal.show();
}

/**
 * The project a command acts on: the one named, else the one of the file
 * in front, else the only one, else the one picked.
 *
 * @param projects - The workspace's Courier projects
 * @param root - The project's folder, when the caller knows it
 * @param placeHolder - What the pick asks, when there is one to make
 * @returns The project, or `undefined` when there is none or none is picked
 * @example
 * ```ts
 * const project = await chooseProject(projects, undefined, "Import into which project?");
 * ```
 */
export async function chooseProject(
  projects: CourierProjects,
  root?: string,
  placeHolder = "Start Courier Studio for which project?",
): Promise<CourierProject | undefined> {
  const all = await projects.list();
  const named = all.find((project) => project.root === root);
  if (named) return named;
  const document = vscode.window.activeTextEditor?.document;
  const own = document?.uri.scheme === "file" && (await projects.projectOf(document.uri.fsPath));
  if (own) return own;
  if (all.length <= 1) return all[0];
  const picked = await vscode.window.showQuickPick(
    all.map((project) => ({
      label: project.name,
      description: vscode.workspace.asRelativePath(project.root),
      project,
    })),
    { placeHolder },
  );
  return picked?.project;
}

async function chooseFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const document = vscode.window.activeTextEditor?.document;
  const own = document && vscode.workspace.getWorkspaceFolder(document.uri);
  if (own) return own;
  if (folders.length <= 1) return folders[0];
  return vscode.window.showWorkspaceFolderPick({ placeHolder: "Set Courier up in which folder?" });
}
