import * as vscode from "vscode";

import { createDefinitionStore, type DefinitionStore } from "../code/definition-store";
import { CALL_LANGUAGES } from "../hints/hint-document";
import { createHintStore, type HintStore } from "../hints/hint-store";
import { keepFresh } from "../keep-fresh";
import { registerStudioPages, type StudioPages } from "../panel/register-studio-panel";
import { type CourierProjects, createCourierProjects } from "../projects/courier-projects";
import { createConfiguredStudio } from "../studio/configured-studio";
import { findStudio } from "../studio/find-studio";
import { fetchCalls, fetchDefinitions, fetchEndpointStats, fetchSites } from "../studio/studio-api";
import type { StudioFinder } from "../studio/studio-in-front";
import { type CourierView, createCourierView } from "../view/courier-view";

/** What every feature of the extension shares: the Studios, what they told, and when to look again. */
export interface CourierCore extends vscode.Disposable {
  readonly context: vscode.ExtensionContext;
  settings(): vscode.WorkspaceConfiguration;
  /** The Studio the settings name, when it is on this machine */
  configured(): string | undefined;
  readonly studioFor: StudioFinder;
  readonly store: HintStore;
  /** Whether a Studio answers, asking it only when the hints have not */
  answers(studio: string): Promise<boolean>;
  readonly projects: CourierProjects;
  readonly view: CourierView;
  readonly definitions: DefinitionStore;
  readonly pages: StudioPages;
  readonly selector: vscode.DocumentSelector;
  /** Studio's figures moved: draw again what shows them */
  readonly onRedraw: vscode.Event<void>;
  /** A Studio started or stopped, a project came or went, a setting changed: look again */
  readonly onRestart: vscode.Event<void>;
  /** Look at the workspace for the first time, and keep looking */
  start(): void;
}

/**
 * The extension's core: the Studios the workspace's projects run — found by
 * their address files, or the one the settings name — what they told the
 * hints, where they found the endpoints declared, the Courier view, and
 * Studio's pages. It asks again every few seconds while the window has
 * focus, and from the start when a Studio starts or stops, a project comes
 * or goes, or a setting changes; the features follow its two events.
 *
 * @param context - The extension's context
 * @returns The core
 * @example
 * ```ts
 * const core = createCourierCore(context);
 * core.onRedraw(() => hints.refreshed());
 * core.start();
 * ```
 */
export function createCourierCore(context: vscode.ExtensionContext): CourierCore {
  const settings = () => vscode.workspace.getConfiguration("courier");
  const configured = createConfiguredStudio();
  const studioFor = async (file: string, workspace: string) =>
    configured() ?? findStudio(file, workspace);
  const store = createHintStore({
    findStudio: studioFor,
    fetchStats: fetchEndpointStats,
    fetchCalls,
  });
  const answers = async (studio: string) =>
    store.statsFor(studio) !== undefined || store.answers(studio);
  const projects = createCourierProjects();
  const view = createCourierView({
    projects: projects.list,
    configured,
    statsFor: store.statsFor,
    answers: store.answers,
    fetchSites,
  });
  const definitions = createDefinitionStore(fetchDefinitions);
  const pages = registerStudioPages({
    extensionUri: context.extensionUri,
    studioFor,
    answers,
    targets: view.targets,
  });
  const redraws = new vscode.EventEmitter<void>();
  const restarts = new vscode.EventEmitter<void>();
  const redraw = () => {
    void view.refresh();
    redraws.fire();
  };
  const restart = () => {
    store.forgetCalls();
    definitions.forget();
    void store.refresh().finally(redraw);
    void pages.refresh();
    restarts.fire();
  };
  const addresses = vscode.workspace.createFileSystemWatcher("**/.courier/studio.json");
  const held = vscode.Disposable.from(
    projects,
    view,
    pages,
    addresses,
    redraws,
    restarts,
    addresses.onDidCreate(restart),
    addresses.onDidChange(restart),
    addresses.onDidDelete(restart),
    projects.onDidChange(restart),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("courier")) restart();
    }),
    vscode.commands.registerCommand("courier.refreshHints", restart),
    keepFresh(() => settings().get<number>("hints.refreshSeconds", 5), store.refresh, redraw),
  );
  return {
    context,
    settings,
    configured,
    studioFor,
    store,
    answers,
    projects,
    view,
    definitions,
    pages,
    selector: CALL_LANGUAGES.map((language) => ({ language, scheme: "file" })),
    onRedraw: redraws.event,
    onRestart: restarts.event,
    start: restart,
    dispose: () => held.dispose(),
  };
}
