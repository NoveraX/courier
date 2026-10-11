import * as vscode from "vscode";

import type { CourierProjects } from "../projects/courier-projects";
import { type StudioFinder, studioInFront } from "../studio/studio-in-front";
import { endpointPage } from "../studio/studio-pages";
import { startStudio } from "./project-commands";

/** Where to open Studio: the Studio and the endpoint a hint names, or the file in front's. */
export interface OpenTarget {
  readonly studio?: string | undefined;
  readonly source?: string | undefined;
  readonly endpoint?: string | undefined;
}

/**
 * Open an endpoint in Courier Studio — or Studio itself — in the browser.
 * With no Studio running for the file in front, offer to start it.
 *
 * @param studioFor - What finds a file's Studio
 * @param projects - The workspace's Courier projects
 * @param target - The Studio and the endpoint, when a hint names them
 * @example
 * ```ts
 * await openInStudio(studioFor, projects, { studio, source: "shop", endpoint: "orders.place" });
 * ```
 */
export async function openInStudio(
  studioFor: StudioFinder,
  projects: CourierProjects,
  target: OpenTarget,
): Promise<void> {
  const address = target.studio ?? (await studioInFront(studioFor));
  if (!address) {
    const answer = await vscode.window.showInformationMessage(
      "Courier Studio is not running for this project.",
      "Start Studio",
    );
    if (answer) await startStudio(projects);
    return;
  }
  const { source, endpoint } = target;
  const page = source && endpoint ? endpointPage(address, source, endpoint) : address;
  await vscode.env.openExternal(vscode.Uri.parse(page));
}
