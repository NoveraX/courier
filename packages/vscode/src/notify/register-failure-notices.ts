import * as vscode from "vscode";

import type { CourierCore } from "../core/courier-core";
import { endpointPage, requestPage } from "../studio/studio-pages";
import { type NewFailure, newFailures } from "./new-failures";

/**
 * Tell of a call that fails while you work, when the settings ask for it:
 * a notice per endpoint at most once a minute — several together in one —
 * with a button to the failure in Studio and one to the failed requests.
 *
 * @param core - The extension's core
 * @returns What stops the notices
 * @example
 * ```ts
 * context.subscriptions.push(registerFailureNotices(core));
 * ```
 */
export function registerFailureNotices(core: CourierCore): vscode.Disposable {
  const seen = new Map<string, { at: number; told: number }>();
  return core.onRedraw(async () => {
    if (!core.settings().get<boolean>("notifications.failures", false)) {
      seen.clear();
      return;
    }
    const now = Date.now();
    const found = (await core.view.targets()).flatMap(({ studio }) =>
      studio ? newFailures(studio, core.store.statsFor(studio) ?? [], seen, now) : [],
    );
    if (found.length > 0) void tell(found);
  });
}

async function tell(found: readonly NewFailure[]): Promise<void> {
  const [first] = found;
  if (!first) return;
  const { studio, stats } = first;
  const message =
    found.length === 1
      ? `${stats.source}.${stats.endpoint} failed: ${stats.lastFailure?.message ?? "no answer"}`
      : `${found.length} endpoints failed: ${found.map((each) => `${each.stats.source}.${each.stats.endpoint}`).join(", ")}`;
  const pick = await vscode.window.showWarningMessage(
    message,
    "Open in Studio",
    "Show Failed Requests",
  );
  if (pick === "Open in Studio") {
    const request = found.length === 1 ? stats.lastFailure?.request : undefined;
    const page = request
      ? requestPage(studio, request)
      : endpointPage(studio, stats.source, stats.endpoint);
    await vscode.commands.executeCommand("courier.openStudioPage", page);
  } else if (pick === "Show Failed Requests") {
    await vscode.commands.executeCommand("courier.requests.showFailed");
    await vscode.commands.executeCommand("courier.requests.focus");
  }
}
