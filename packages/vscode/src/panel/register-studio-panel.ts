import * as vscode from "vscode";

import type { StudioTarget } from "../projects/studio-targets";
import { isLocalStudio } from "../studio/local-address";
import { studioAtHand } from "../studio/studio-at-hand";
import type { StudioFinder } from "../studio/studio-in-front";
import { studioTokenFor } from "../studio/studio-token";
import { createStudioPanel, type StudioPanel } from "./studio-panel";

/** What opening Studio's pages needs. */
export interface StudioPagesDeps {
  readonly extensionUri: vscode.Uri;
  readonly studioFor: StudioFinder;
  answers(studio: string): Promise<boolean>;
  targets(): Promise<readonly StudioTarget[]>;
}

/** Studio's pages, opened where the settings say: the editor's own tab, or the browser. */
export interface StudioPages extends vscode.Disposable {
  open(page: string): Promise<void>;
  /** A Studio started or stopped: show it in the tab that waits for it */
  refresh(): Promise<void>;
  readonly panel: StudioPanel;
}

/**
 * Open Studio's pages where `courier.studio.openIn` says — a tab of the
 * editor's own by default, or the browser — and register the commands that
 * open Studio in either one, and the one the hints' links run. Asked to
 * open Studio while none runs, they start it, and open it once it answers.
 *
 * @param deps - What opening needs
 * @returns The pages
 * @example
 * ```ts
 * const pages = registerStudioPages({ extensionUri, studioFor, answers, targets });
 * await pages.open("http://localhost:6280/audit");
 * ```
 */
export function registerStudioPages(deps: StudioPagesDeps): StudioPages {
  const panel = createStudioPanel({
    extensionUri: deps.extensionUri,
    answers: deps.answers,
    tokenFor: (studio) => studioTokenFor(studio, deps.targets),
  });
  const inBrowser = async (page: string) => {
    await vscode.env.openExternal(vscode.Uri.parse(page));
  };
  const open = async (page: string) => {
    if (!isLocalStudio(page)) return;
    const where = vscode.workspace
      .getConfiguration("courier")
      .get<string>("studio.openIn", "editor");
    if (where === "browser") await inBrowser(page);
    else await panel.show(page);
  };
  const home = () => studioAtHand(deps.studioFor, deps.targets);
  /* Where Studio opens once the one started for it answers. */
  let waiting: ((studio: string) => Promise<unknown>) | undefined;
  const openHome = async (show: (studio: string) => Promise<unknown>) => {
    const studio = await home();
    if (studio && (await deps.answers(studio))) {
      await show(studio);
      return;
    }
    waiting = show;
    await vscode.commands.executeCommand("courier.startStudio");
  };
  const held = vscode.Disposable.from(
    panel,
    vscode.commands.registerCommand("courier.openStudioPage", (page: unknown) =>
      typeof page === "string" ? open(page) : undefined,
    ),
    vscode.commands.registerCommand("courier.openStudioInEditor", () => openHome(panel.show)),
    vscode.commands.registerCommand("courier.openStudioInBrowser", () => openHome(inBrowser)),
  );
  return {
    open,
    panel,
    async refresh() {
      await panel.refresh();
      const studio = waiting && (await home());
      if (!waiting || !studio || !(await deps.answers(studio))) return;
      const show = waiting;
      waiting = undefined;
      await show(studio);
    },
    dispose: () => held.dispose(),
  };
}
