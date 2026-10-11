import { dirname } from "node:path";
import * as vscode from "vscode";

import type { CourierProjects } from "../projects/courier-projects";
import type { StudioTarget } from "../projects/studio-targets";
import type { StudioState } from "./studio-status";

/** What finds the Studio a file's project runs: the settings' one, or the nearest address file. */
export type StudioFinder = (file: string, workspace: string) => Promise<string | undefined>;

/** What tells the state of the project in front. */
export interface FrontSources {
  readonly studioFor: StudioFinder;
  readonly projects: CourierProjects;
  /** Whether a Studio answers, asking it only when the hints have not */
  answers(studio: string): Promise<boolean>;
  targets(): Promise<readonly StudioTarget[]>;
}

/**
 * The address of the Studio for the file in front, answering or not.
 *
 * @param studioFor - What finds a file's Studio
 * @returns The address, or `undefined` with no file in front, or none found
 * @example
 * ```ts
 * await studioInFront(studioFor); // "http://localhost:6280"
 * ```
 */
export async function studioInFront(studioFor: StudioFinder): Promise<string | undefined> {
  const document = vscode.window.activeTextEditor?.document;
  if (document?.uri.scheme !== "file") return undefined;
  const folder =
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? dirname(document.uri.fsPath);
  return studioFor(document.uri.fsPath, folder);
}

/**
 * What the status bar says: the Studio of the file in front while it
 * answers; the file's Courier project when its Studio does not run; with no
 * file in front, the workspace's only project.
 *
 * @param sources - What tells the state
 * @returns The state, or `undefined` outside any Courier project
 * @example
 * ```ts
 * await stateInFront(sources); // { stopped: shop }
 * ```
 */
export async function stateInFront(sources: FrontSources): Promise<StudioState> {
  const document = vscode.window.activeTextEditor?.document;
  if (document?.uri.scheme === "file") {
    const studio = await studioInFront(sources.studioFor);
    if (studio && (await sources.answers(studio))) return { studio };
    const project = await sources.projects.projectOf(document.uri.fsPath);
    return project && { stopped: project };
  }
  const targets = await sources.targets();
  const [only] = targets;
  if (targets.length !== 1 || !only) return undefined;
  if (only.studio) return { studio: only.studio };
  return only.project && { stopped: only.project };
}
