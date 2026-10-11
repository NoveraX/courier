import * as vscode from "vscode";

import { startStudio } from "../commands/project-commands";
import type { CourierProjects } from "../projects/courier-projects";
import { endpointPage, failuresPage, requestPage } from "../studio/studio-pages";
import type { CourierNode } from "./tree-nodes";

/**
 * The actions on the Courier view's rows: open an endpoint in Studio, its
 * failed calls in the Timeline, its latest failure in the inspector; open
 * a project's Studio, or start it; and draw the view again.
 *
 * @param projects - The workspace's Courier projects
 * @param refresh - What draws the view again
 * @returns What unregisters them
 * @example
 * ```ts
 * context.subscriptions.push(registerViewCommands(projects, view.refresh));
 * ```
 */
export function registerViewCommands(
  projects: CourierProjects,
  refresh: () => Promise<void>,
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand("courier.view.openInStudio", (node?: CourierNode) =>
      open(node && pageOf(node)),
    ),
    vscode.commands.registerCommand("courier.view.showFailures", (node?: CourierNode) =>
      open(
        node?.kind === "endpoint"
          ? failuresPage(node.studio, node.stats.source, node.stats.endpoint)
          : undefined,
      ),
    ),
    vscode.commands.registerCommand("courier.view.openLatestFailure", (node?: CourierNode) => {
      const request = node?.kind === "endpoint" ? node.stats.lastFailure?.request : undefined;
      return open(
        node?.kind === "endpoint" && request ? requestPage(node.studio, request) : undefined,
      );
    }),
    vscode.commands.registerCommand("courier.view.startStudio", (node?: CourierNode) =>
      startStudio(projects, node?.kind === "project" ? node.project.root : undefined),
    ),
    vscode.commands.registerCommand("courier.view.refresh", refresh),
  );
}

function pageOf(node: CourierNode): string | undefined {
  switch (node.kind) {
    case "project":
      return node.studio;
    case "endpoint":
    case "site":
      return endpointPage(node.studio, node.stats.source, node.stats.endpoint);
    default:
      return undefined;
  }
}

async function open(page: string | undefined): Promise<void> {
  if (page) await vscode.env.openExternal(vscode.Uri.parse(page));
}
