import * as vscode from "vscode";

import type { MockConditions } from "../studio/live-types";
import { StudioRefusal, setConditions, switchScenario } from "../studio/studio-live-api";
import { requestPage } from "../studio/studio-pages";
import type { MockNode, MocksView } from "./mocks-view";
import type { RequestNode, RequestsView } from "./requests-view";

/** What the live views' actions need. */
export interface LiveCommandDeps {
  readonly requests: RequestsView;
  readonly mocks: MocksView;
  open(page: string): Promise<void>;
  /** The project's token, which a change to a mock needs */
  tokenFor(studio: string): Promise<string | undefined>;
}

/* Studio's own presets, named as its Mocks page names them. */
const DELAYS: readonly (vscode.QuickPickItem & { value: MockConditions["latency"] })[] = [
  { label: "No delay", value: "none" },
  { label: "4G", description: "100–350 ms", value: "4g" },
  { label: "3G", description: "300–900 ms", value: "3g" },
  { label: "Satellite", description: "600–800 ms", value: "satellite" },
];
const FAULTS: readonly (vscode.QuickPickItem & { value: MockConditions["chaos"] })[] = [
  { label: "Stable", description: "every call answered", value: "stable" },
  { label: "Degraded", description: "1 call in 10 fails: 500, timeout", value: "degraded" },
  {
    label: "Unstable",
    description: "2 calls in 5 fail: 500, 503, timeout, reset",
    value: "unstable",
  },
  { label: "Down", description: "every call fails: 503", value: "down" },
];

/**
 * The actions of the Requests and Mocks views: open a request in Studio's
 * inspector, show the failed ones alone or all; switch a mock's scenario,
 * set its delay or faults by Studio's presets, or stop them.
 *
 * @param deps - What the actions need
 * @returns What unregisters them
 * @example
 * ```ts
 * context.subscriptions.push(registerLiveCommands({ requests, mocks, open, tokenFor }));
 * ```
 */
export function registerLiveCommands(deps: LiveCommandDeps): vscode.Disposable {
  const { requests, mocks } = deps;
  const failedOnly = async (on: boolean) => {
    requests.failedOnly(on);
    await vscode.commands.executeCommand("setContext", "courier.requests.failedOnly", on);
  };
  const change = (
    node: MockNode | undefined,
    set: (studio: string, token: string | undefined, mock: string) => Promise<void>,
  ) =>
    node?.kind === "mock" || node?.kind === "scenario"
      ? changed(deps, node.studio, (token) => set(node.studio, token, node.mock.id))
      : undefined;
  const conditions = (node: MockNode | undefined, wanted: MockConditions) =>
    change(node, (studio, token, mock) => setConditions(studio, token, mock, wanted));
  return vscode.Disposable.from(
    vscode.commands.registerCommand("courier.request.open", (node?: RequestNode) =>
      node?.kind === "request" ? deps.open(requestPage(node.studio, node.request.id)) : undefined,
    ),
    vscode.commands.registerCommand("courier.requests.showFailed", () => failedOnly(true)),
    vscode.commands.registerCommand("courier.requests.showAll", () => failedOnly(false)),
    vscode.commands.registerCommand("courier.requests.refresh", () => requests.refreshed()),
    vscode.commands.registerCommand("courier.mocks.refresh", () => mocks.refreshed()),
    vscode.commands.registerCommand("courier.mock.scenario", (node?: MockNode) =>
      node?.kind === "scenario"
        ? change(node, (studio, token, mock) =>
            switchScenario(studio, token, mock, node.scenario.name),
          )
        : undefined,
    ),
    vscode.commands.registerCommand("courier.mock.delay", async (node?: MockNode) => {
      const picked = await vscode.window.showQuickPick(DELAYS, {
        placeHolder: "Delay the mock's answers by",
      });
      if (picked) await conditions(node, { latency: picked.value });
    }),
    vscode.commands.registerCommand("courier.mock.faults", async (node?: MockNode) => {
      const picked = await vscode.window.showQuickPick(FAULTS, {
        placeHolder: "Fail a share of the mock's answers",
      });
      if (picked) await conditions(node, { chaos: picked.value });
    }),
    vscode.commands.registerCommand("courier.mock.stopFaults", (node?: MockNode) =>
      conditions(node, { stop: true }),
    ),
  );
}

/* Make a change with the project's token, then draw the mocks again; Studio's refusal says why in its words. */
async function changed(
  deps: LiveCommandDeps,
  studio: string,
  make: (token: string | undefined) => Promise<void>,
): Promise<void> {
  try {
    await make(await deps.tokenFor(studio));
  } catch (error) {
    const said =
      error instanceof StudioRefusal && error.status === 401
        ? "Courier Studio changes mocks only with the project's token, which it writes as it starts; a Studio the settings name, for a project outside the workspace, is changed in Studio itself."
        : `Courier Studio did not make the change: ${error instanceof Error ? error.message : String(error)}`;
    void vscode.window.showErrorMessage(said);
  }
  deps.mocks.refreshed();
}
