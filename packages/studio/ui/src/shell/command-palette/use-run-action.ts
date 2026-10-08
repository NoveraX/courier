import { useNavigate } from "@tanstack/react-router";

import { exportShownRequests } from "@/features/sessions/export-requests";
import { pickSessionFile } from "@/features/sessions/open-session-file";
import { shareSessionFile } from "@/features/sessions/session-file-dialog-store";
import { saveAsTest } from "@/features/tests/recorded-test-store";
import { useBackToLive } from "@/hooks/use-back-to-live";
import { useClearRequests } from "@/hooks/use-clear-requests";
import { useStudioStore } from "@/store";
import { nextTheme } from "../theme-cycle";
import type { PaletteAction } from "./palette-entries";

/**
 * What runs a palette entry's action — also behind the shortcuts that run
 * one without the palette.
 *
 * @returns A function that runs an action
 * @example
 * ```ts
 * const run = useRunAction();
 * run({ kind: "toggle-recording" });
 * ```
 */
export function useRunAction(): (action: PaletteAction) => void {
  const navigate = useNavigate();
  const backToLive = useBackToLive();
  const clearRequests = useClearRequests();
  return (action) => {
    const state = useStudioStore.getState();
    switch (action.kind) {
      case "go":
        void navigate({ to: action.to });
        return;
      case "open-request":
        void navigate({ to: "/timeline", search: { req: action.id } });
        return;
      case "show-errors":
        void navigate({ to: "/timeline", search: { view: "errors" } });
        return;
      case "show-streams":
        void navigate({ to: "/timeline", search: { transport: "sse,ws" } });
        return;
      case "export":
        void exportShownRequests(state.settings.defaultExportFormat);
        return;
      case "share-session-file":
        shareSessionFile({ kind: "shown" });
        return;
      case "save-as-test":
        saveAsTest({ kind: "shown" });
        return;
      case "open-session-file":
        pickSessionFile();
        return;
      case "toggle-recording":
        if (state.shownSession) backToLive();
        else state.togglePaused();
        return;
      case "toggle-theme":
        state.setTheme(nextTheme(state.theme));
        return;
      case "clear-requests":
        clearRequests();
    }
  };
}
