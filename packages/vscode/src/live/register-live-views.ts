import * as vscode from "vscode";

import type { CourierCore } from "../core/courier-core";
import { fetchMocks, fetchRequests } from "../studio/studio-live-api";
import { studioTokenFor } from "../studio/studio-token";
import { registerLiveCommands } from "./live-commands";
import { createMocksView } from "./mocks-view";
import { createRequestsView } from "./requests-view";

/**
 * The live views beside the endpoints: the requests Studio records as the
 * app runs, and the mocks it runs with their scenarios — drawn again as
 * Studio's figures move, and from the start when the Studios change.
 *
 * @param core - The extension's core
 * @returns What removes them
 * @example
 * ```ts
 * context.subscriptions.push(registerLiveViews(core));
 * ```
 */
export function registerLiveViews(core: CourierCore): vscode.Disposable {
  const requests = createRequestsView(core.view.targets, fetchRequests);
  const mocks = createMocksView(core.view.targets, fetchMocks);
  return vscode.Disposable.from(
    vscode.window.createTreeView("courier.requests", { treeDataProvider: requests }),
    vscode.window.createTreeView("courier.mocks", { treeDataProvider: mocks }),
    registerLiveCommands({
      requests,
      mocks,
      open: core.pages.open,
      tokenFor: (studio) => studioTokenFor(studio, core.view.targets),
    }),
    core.onRedraw(() => {
      requests.refreshed();
      mocks.refreshed();
    }),
  );
}
