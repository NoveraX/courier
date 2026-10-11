import * as vscode from "vscode";

import { isLocalStudio } from "../studio/local-address";
import { frameAddress } from "./frame-address";
import { panelHtml } from "./panel-html";
import { type PanelMessage, panelMessage } from "./panel-message";

/** What the panel needs: whether a Studio answers, and its token. */
export interface StudioPanelDeps {
  readonly extensionUri: vscode.Uri;
  answers(studio: string): Promise<boolean>;
  /** The token of the project a Studio runs for, which lets its page change things */
  tokenFor(studio: string): Promise<string | undefined>;
}

/** Courier Studio in a tab of the editor's own. */
export interface StudioPanel extends vscode.Disposable {
  /** Show a page of Studio's: its own, an endpoint, a request, the audit */
  show(page: string): Promise<void>;
  /** Show Studio again once it answers, when the tab waits for it */
  refresh(): Promise<void>;
}

/** The kind of panel VS Code restores after a restart. */
export const STUDIO_PANEL = "courier.studio";
const COMMANDS = new Set(["courier.startStudio"]);

/**
 * Courier Studio in a tab of the editor's own, beside the code: the page
 * asked for opens there — another one in the same Studio without loading
 * it again — Studio's links to the code open the file beside it, and the
 * tab opens on the page it showed after a restart. While Studio does not
 * run, the tab says so and offers to start it.
 *
 * @param deps - What the panel needs
 * @returns The panel
 * @example
 * ```ts
 * const panel = createStudioPanel({ extensionUri, answers, tokenFor });
 * await panel.show("http://localhost:6280/audit");
 * ```
 */
export function createStudioPanel(deps: StudioPanelDeps): StudioPanel {
  let panel: vscode.WebviewPanel | undefined;
  let shown: { page: string; studio: string; running: boolean } | undefined;

  async function load(target: vscode.WebviewPanel, page: string): Promise<void> {
    const studio = new URL(page).origin;
    const running = await deps.answers(studio);
    shown = { page, studio, running };
    const { cspSource } = target.webview;
    if (!running) {
      target.webview.html = panelHtml({ kind: "stopped", page }, cspSource);
      return;
    }
    const outside = await vscode.env.asExternalUri(vscode.Uri.parse(studio));
    const token = await deps.tokenFor(studio);
    const frame = frameAddress(page, studio, outside.toString(true), token, editorTheme());
    target.webview.html = panelHtml({ kind: "studio", frame, page }, cspSource);
  }

  function adopt(target: vscode.WebviewPanel): vscode.WebviewPanel {
    target.iconPath = vscode.Uri.joinPath(deps.extensionUri, "media", "courier-mark.svg");
    target.webview.onDidReceiveMessage((data: unknown) => handle(panelMessage(data)));
    target.onDidDispose(() => {
      if (panel === target) panel = undefined;
    });
    panel = target;
    return target;
  }

  const restore = vscode.window.registerWebviewPanelSerializer(STUDIO_PANEL, {
    async deserializeWebviewPanel(restored, state: unknown) {
      adopt(restored);
      const page = pageIn(state);
      if (page) await load(restored, page);
    },
  });

  return {
    async show(page) {
      if (!isLocalStudio(page)) return;
      const studio = new URL(page).origin;
      if (panel && shown?.running && shown.studio === studio) {
        panel.reveal();
        await panel.webview.postMessage({
          type: "navigate",
          path: page.slice(studio.length) || "/",
        });
        return;
      }
      const target = panel ?? adopt(created());
      target.reveal();
      await load(target, page);
    },
    async refresh() {
      if (panel && shown && !shown.running) await load(panel, shown.page);
    },
    dispose() {
      restore.dispose();
      panel?.dispose();
    },
  };
}

function created(): vscode.WebviewPanel {
  return vscode.window.createWebviewPanel(
    STUDIO_PANEL,
    "Courier Studio",
    { viewColumn: vscode.ViewColumn.Active },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  );
}

async function handle(message: PanelMessage | undefined): Promise<void> {
  if (!message) return;
  if (message.type === "open-file") {
    const at = new vscode.Position(message.line - 1, message.column - 1);
    await vscode.window.showTextDocument(vscode.Uri.file(message.path), {
      viewColumn: vscode.ViewColumn.Beside,
      selection: new vscode.Range(at, at),
    });
  } else if (message.type === "open-external") {
    await vscode.env.openExternal(vscode.Uri.parse(message.url));
  } else if (message.type === "command" && COMMANDS.has(message.command)) {
    await vscode.commands.executeCommand(message.command);
  }
}

function pageIn(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const page: unknown = Reflect.get(state, "page");
  return typeof page === "string" && isLocalStudio(page) ? page : undefined;
}

/* Studio's theme for the editor's: a light or high-contrast light theme is light, every other dark. */
function editorTheme(): "dark" | "light" {
  const { kind } = vscode.window.activeColorTheme;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? "light"
    : "dark";
}
