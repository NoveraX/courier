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
 * Open an endpoint in Courier Studio — or Studio itself — where the
 * settings say: the editor's own tab, or the browser. With no Studio
 * running for the file in front, offer to start it.
 *
 * @param studioFor - What finds a file's Studio
 * @param projects - The workspace's Courier projects
 * @param target - The Studio and the endpoint, when a hint names them
 * @param open - What opens a page of Studio's
 * @example
 * ```ts
 * await openInStudio(studioFor, projects, { studio, source: "shop", endpoint: "orders.place" }, pages.open);
 * ```
 */
export async function openInStudio(
  studioFor: StudioFinder,
  projects: CourierProjects,
  target: OpenTarget,
  open: (page: string) => Promise<void>,
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
  await open(page);
}
