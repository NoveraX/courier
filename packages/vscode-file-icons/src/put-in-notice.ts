import * as vscode from "vscode";

import { hasCourierIcons } from "./apply-icons";
import { ICON_THEMES, type IconTheme } from "./icon-files";
import { logFailure } from "./icons-log";

/* When a window last said that the icons went in by themselves, in the profile's state every window shares. */
const TOLD = "courier.fileIcons.toldAt";
const TAKE_OUT = "Take Them Out";

/** The message that Courier's icons went in by themselves, said once for all the profile's windows. */
export interface PutInNotice extends vscode.Disposable {
  /**
   * Say that the icons went into a theme by themselves, with the way to
   * take them out — in this window once the user is in it.
   *
   * @param theme - The theme they went into
   * @param decidedAt - When this window found them in no theme and put them in
   */
  tell(theme: IconTheme, decidedAt: number): void;
}

/**
 * The one message that Courier's icons went in by themselves. Every window
 * of the profile starts the extension together and puts them in together —
 * as it is installed, as the editor opens its windows again, as the user
 * picks another icon theme, a setting every window sees. The window the
 * user is in says so — at once, or once the user comes to it — unless
 * another window said it since this one put the icons in, or they are out
 * again by then.
 *
 * @param state - The profile's state, every window's
 * @param takeOut - What takes the icons out, on the message's button
 * @returns How to say it, and to stop waiting for the user
 * @example
 * ```ts
 * const notice = putInNotice(context.globalState, () => void remove());
 * notice.tell("vsicons", decidedAt);
 * ```
 */
export function putInNotice(state: vscode.Memento, takeOut: () => unknown): PutInNotice {
  let waiting: vscode.Disposable | undefined;
  const say = (theme: IconTheme, decidedAt: number) => {
    const told: unknown = state.get(TOLD);
    if (!hasCourierIcons(theme) || (typeof told === "number" && told >= decidedAt)) return;
    state.update(TOLD, Date.now()).then(undefined, (error: unknown) => {
      logFailure("Courier could not keep that it said its icons went in", error);
    });
    vscode.window
      .showInformationMessage(
        `Courier's own icons for courier.config.ts, courier.mocks.ts and .courier are in ${ICON_THEMES[theme].label} now.`,
        TAKE_OUT,
      )
      .then((pick) => {
        if (pick === TAKE_OUT) takeOut();
      });
  };
  return {
    tell(theme, decidedAt) {
      waiting?.dispose();
      waiting = undefined;
      if (vscode.window.state.focused) {
        say(theme, decidedAt);
        return;
      }
      waiting = vscode.window.onDidChangeWindowState((window) => {
        if (!window.focused) return;
        waiting?.dispose();
        waiting = undefined;
        say(theme, decidedAt);
      });
    },
    dispose() {
      waiting?.dispose();
      waiting = undefined;
    },
  };
}
