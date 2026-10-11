import * as vscode from "vscode";

/**
 * Ask again every few seconds while the window has focus — the figures move
 * while the app runs — and hand on whether anything changed.
 *
 * @param seconds - How often, read on each turn: at least two seconds
 * @param refresh - What asks again, and says whether anything changed
 * @param changed - What redraws when it did
 * @returns What stops asking
 * @example
 * ```ts
 * context.subscriptions.push(keepFresh(() => 5, store.refresh, redraw));
 * ```
 */
export function keepFresh(
  seconds: () => number,
  refresh: () => Promise<boolean>,
  changed: () => void,
): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => setTimeout(tick, Math.max(2, seconds()) * 1000);
  async function tick(): Promise<void> {
    if (vscode.window.state.focused && (await refresh())) changed();
    timer = later();
  }
  timer = later();
  return { dispose: () => clearTimeout(timer) };
}
