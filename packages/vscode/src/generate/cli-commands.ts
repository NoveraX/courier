import * as vscode from "vscode";

import { chooseProject } from "../commands/project-commands";
import type { CourierCore } from "../core/courier-core";
import { fetchOpenApi } from "../studio/studio-api";
import { runStudioCommand } from "./studio-cli";

/**
 * The commands that run Courier Studio's own: import an API from an
 * OpenAPI, Swagger or Postman specification, by its address or its file;
 * show a source as an OpenAPI document, and save it; and report what a
 * change to the API breaks, against a git ref.
 *
 * @param core - The extension's core
 * @returns What unregisters them
 * @example
 * ```ts
 * context.subscriptions.push(registerCliCommands(core));
 * ```
 */
export function registerCliCommands(core: CourierCore): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand("courier.importApi", () => importApi(core)),
    vscode.commands.registerCommand("courier.showOpenApi", () => showOpenApi(core)),
    vscode.commands.registerCommand("courier.checkApiChanges", async () => {
      const project = await chooseProject(
        core.projects,
        undefined,
        "Check the API of which project?",
      );
      if (!project) return;
      const base = await vscode.window.showInputBox({
        title: "Check API Changes: against which git ref",
        value: "origin/main",
        prompt: "A branch, a tag or a commit: what the API is compared with",
      });
      if (base) runStudioCommand(project, "API Changes", ["diff", "--base", base]);
    }),
  );
}

async function importApi(core: CourierCore): Promise<void> {
  const project = await chooseProject(
    core.projects,
    undefined,
    "Import an API into which project?",
  );
  if (!project) return;
  const how = await vscode.window.showQuickPick(
    [
      {
        label: "From an address…",
        description: "an OpenAPI, Swagger or Postman document online",
        by: "url",
      },
      {
        label: "From a file…",
        description: "a .json or .yaml document of the project's",
        by: "file",
      },
    ],
    { title: "Import an API" },
  );
  const spec =
    how?.by === "url"
      ? await vscode.window.showInputBox({
          title: "Import an API: its address",
          placeHolder: "https://api.example.com/openapi.json",
        })
      : how?.by === "file"
        ? (
            await vscode.window.showOpenDialog({
              defaultUri: vscode.Uri.file(project.root),
              filters: { Specifications: ["json", "yaml", "yml"] },
            })
          )?.[0]?.fsPath
        : undefined;
  if (spec) runStudioCommand(project, "Import API", ["import", spec]);
}

async function showOpenApi(core: CourierCore): Promise<void> {
  const running = (await core.view.targets()).flatMap((target) =>
    target.studio ? [target.studio] : [],
  );
  const studio = running.length === 1 ? running[0] : await pick(running, "Which project's Studio?");
  if (!studio) return;
  const sources = [...new Set((core.store.statsFor(studio) ?? []).map((stats) => stats.source))];
  const source =
    sources.length === 1
      ? sources[0]
      : await pick(sources, "Which source, as an OpenAPI document?");
  if (!source) return;
  const document = await fetchOpenApi(studio, source);
  const shown = await vscode.workspace.openTextDocument({
    language: "json",
    content: document.text,
  });
  await vscode.window.showTextDocument(shown, { preview: false });
  const left =
    document.leftOut.length > 0
      ? ` ${document.leftOut.length} endpoints have no OpenAPI form and are left out.`
      : "";
  const save = await vscode.window.showInformationMessage(
    `${source} as OpenAPI ${document.version}.${left}`,
    "Save to a File…",
  );
  if (!save) return;
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(document.fileName),
  });
  if (target) await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(document.text));
}

async function pick(items: readonly string[], title: string): Promise<string | undefined> {
  if (items.length === 0) {
    void vscode.window.showInformationMessage(
      "Courier Studio is not running: start it, then try again.",
    );
    return undefined;
  }
  return vscode.window.showQuickPick([...items], { title });
}
