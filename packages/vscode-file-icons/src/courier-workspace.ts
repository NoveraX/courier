import * as vscode from "vscode";

const CONFIGS = "**/courier.config.{ts,mts,cts,js,mjs,cjs}";
/* Folders that hold installed or built copies, never a project of the user's. */
const SKIPPED =
  "**/{node_modules,.git,dist,build,.next,.nuxt,.output,.svelte-kit,.turbo,coverage}/**";

/** Whether the workspace holds a Courier project, told again as configs come and go. */
export interface CourierWorkspace extends vscode.Disposable {
  hasProject(): Promise<boolean>;
  readonly onDidChange: vscode.Event<void>;
}

/**
 * Whether the workspace holds a Courier project — a folder with a
 * `courier.config` — found by the editor's own search, which reaches a
 * remote window's files too, and found again whenever a config comes or
 * goes or the workspace's folders change.
 *
 * @returns The workspace, as Courier sees it
 * @example
 * ```ts
 * const workspace = watchCourierWorkspace();
 * if (await workspace.hasProject()) offer();
 * ```
 */
export function watchCourierWorkspace(): CourierWorkspace {
  let found: Promise<boolean> | undefined;
  const changed = new vscode.EventEmitter<void>();
  const watcher = vscode.workspace.createFileSystemWatcher(CONFIGS, false, true, false);
  const forget = () => {
    found = undefined;
    changed.fire();
  };
  const held = [
    watcher,
    watcher.onDidCreate(forget),
    watcher.onDidDelete(forget),
    vscode.workspace.onDidChangeWorkspaceFolders(forget),
  ];
  return {
    hasProject() {
      found ??= Promise.resolve(vscode.workspace.findFiles(CONFIGS, SKIPPED, 1)).then(
        (configs) => configs.length > 0,
      );
      return found;
    },
    onDidChange: changed.event,
    dispose() {
      for (const each of held) each.dispose();
      changed.dispose();
    },
  };
}
