import * as vscode from "vscode";

import { type StudioTarget, studioTargets, type TargetSources } from "../projects/studio-targets";
import type { CallSite } from "../studio/studio-types";
import { createEndpointTree } from "./endpoint-tree";

/** What the Courier view reads: the Studios to show, what they told the hints, and the calls' places. */
export interface CourierViewSources extends TargetSources {
  fetchSites(studio: string, source: string, endpoint: string): Promise<CallSite[]>;
}

/** The Courier view in the Activity Bar. */
export interface CourierView extends vscode.Disposable {
  /** Find the Studios again and draw the view: one started or stopped, a project came, figures moved */
  refresh(): Promise<void>;
  /** The Studios as last found */
  targets(): Promise<readonly StudioTarget[]>;
}

/**
 * The Courier view: each project's endpoints and how their calls went,
 * a badge on the Activity Bar counting the endpoints with failed requests,
 * and — while no Studio runs — the welcome that starts one or sets Courier
 * up. The context keys it sets choose which welcome shows.
 *
 * @param sources - What the view reads
 * @returns The view
 * @example
 * ```ts
 * const view = createCourierView({ projects, configured, statsFor, answers, fetchSites });
 * await view.refresh();
 * ```
 */
export function createCourierView(sources: CourierViewSources): CourierView {
  let targets = studioTargets(sources);
  let turns = 0;
  const tree = createEndpointTree({
    targets: () => targets,
    statsFor: sources.statsFor,
    fetchSites: sources.fetchSites,
  });
  const view = vscode.window.createTreeView("courier.endpoints", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });

  async function refresh(): Promise<void> {
    const turn = ++turns;
    targets = studioTargets(sources);
    const found = await targets;
    /* A slower look than the latest must not undo what the latest drew. */
    if (turn !== turns) return;
    const running = found.flatMap((target) => (target.studio ? [target.studio] : []));
    const failing = running
      .flatMap((studio) => sources.statsFor(studio) ?? [])
      .filter((stats) => stats.failed > 0).length;
    view.badge = failing > 0 ? { value: failing, tooltip: failingText(failing) } : undefined;
    view.description = found.length === 1 && running[0] ? new URL(running[0]).host : "";
    await setContext("courier.hasProject", found.length > 0);
    await setContext("courier.studioRunning", running.length > 0);
    await setContext("courier.surveyed", true);
    tree.refreshed();
  }

  return { refresh, targets: () => targets, dispose: () => view.dispose() };
}

function failingText(failing: number): string {
  return failing === 1
    ? "1 endpoint has failed requests"
    : `${failing} endpoints have failed requests`;
}

async function setContext(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand("setContext", key, value);
}
