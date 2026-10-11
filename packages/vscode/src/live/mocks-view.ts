import * as vscode from "vscode";
import { loggedAs } from "../log/courier-log";
import type { CourierProject } from "../projects/courier-projects";
import type { StudioTarget } from "../projects/studio-targets";
import type { MockScenario, StudioMock } from "../studio/live-types";

/** A row of the Mocks view. */
export type MockNode =
  | { readonly kind: "project"; readonly project: CourierProject; readonly studio: string }
  | { readonly kind: "mock"; readonly studio: string; readonly mock: StudioMock }
  | {
      readonly kind: "scenario";
      readonly studio: string;
      readonly mock: StudioMock;
      readonly scenario: MockScenario;
    }
  | { readonly kind: "note"; readonly id: string; readonly text: string };

/** The Mocks view's rows. */
export interface MocksView extends vscode.TreeDataProvider<MockNode> {
  /** Draw the rows again: a mock changed */
  refreshed(): void;
}

/**
 * The Mocks view: the mocks each Studio runs — whether each runs, its
 * delay and faults — and under each its scenarios, the one in force
 * marked; a click on another switches the mock to it.
 *
 * @param targets - The Studios that run for the workspace
 * @param fetchMocks - What asks a Studio for its mocks
 * @returns The view's rows
 * @example
 * ```ts
 * const mocks = createMocksView(core.view.targets, fetchMocks);
 * ```
 */
export function createMocksView(
  targets: () => Promise<readonly StudioTarget[]>,
  fetchMocks: (studio: string) => Promise<StudioMock[]>,
): MocksView {
  const changed = new vscode.EventEmitter<undefined>();
  const mocksOf = async (studio: string): Promise<MockNode[]> => {
    const mocks = await fetchMocks(studio).catch(
      loggedAs(`Studio at ${studio} did not list its mocks`, undefined),
    );
    const note = (text: string): MockNode[] => [{ kind: "note", id: `note:${studio}`, text }];
    if (mocks === undefined) return note("Courier Studio did not answer");
    if (mocks.length === 0) return note("No mock: Studio runs those courier.mocks.ts declares");
    return mocks.map((mock) => ({ kind: "mock", studio, mock }));
  };
  return {
    onDidChangeTreeData: changed.event,
    refreshed: () => changed.fire(undefined),
    getTreeItem: mockItem,
    async getChildren(node) {
      if (node?.kind === "project") return mocksOf(node.studio);
      if (node?.kind === "mock")
        return node.mock.scenarios.map((scenario) => ({ ...node, kind: "scenario", scenario }));
      if (node) return [];
      const running = (await targets()).flatMap((target) => (target.studio ? [target] : []));
      const [only] = running;
      if (running.length === 1 && only?.studio) return mocksOf(only.studio);
      return running.flatMap((target) =>
        target.project && target.studio
          ? [{ kind: "project", project: target.project, studio: target.studio }]
          : [],
      );
    },
  };
}

function mockItem(node: MockNode): vscode.TreeItem {
  const { Collapsed, Expanded, None } = vscode.TreeItemCollapsibleState;
  if (node.kind === "project") {
    const item = new vscode.TreeItem(node.project.name, Expanded);
    item.id = `mocks:${node.studio}`;
    item.iconPath = new vscode.ThemeIcon("pulse");
    return item;
  }
  if (node.kind === "note") {
    const item = new vscode.TreeItem(node.text, None);
    item.id = node.id;
    item.iconPath = new vscode.ThemeIcon("info");
    return item;
  }
  if (node.kind === "scenario") return scenarioItem(node);
  const { mock } = node;
  const item = new vscode.TreeItem(mock.name, mock.scenarios.length > 0 ? Collapsed : None);
  item.id = `mock:${node.studio}:${mock.id}`;
  const faulty = mock.latency !== "none" || mock.chaos !== "none";
  item.description = [
    mock.status,
    mock.url && new URL(mock.url).host,
    mock.latency !== "none" && `delay ${mock.latency}`,
    mock.chaos !== "none" && `faults ${mock.chaos}`,
  ]
    .filter(Boolean)
    .join(" · ");
  item.tooltip = [
    `${mock.name}${mock.source ? ` · ${mock.source}` : ""}`,
    mock.url,
    mock.activeScenario && `Scenario: ${mock.activeScenario}`,
  ]
    .filter(Boolean)
    .join("\n");
  const color = mock.status === "running" ? "testing.iconPassed" : "disabledForeground";
  item.iconPath = new vscode.ThemeIcon("server-process", new vscode.ThemeColor(color));
  item.contextValue = faulty ? "courier.mock.faulty" : "courier.mock";
  return item;
}

function scenarioItem(node: Extract<MockNode, { kind: "scenario" }>): vscode.TreeItem {
  const { mock, scenario } = node;
  const active = mock.activeScenario === scenario.name;
  const item = new vscode.TreeItem(scenario.name, vscode.TreeItemCollapsibleState.None);
  item.id = `scenario:${node.studio}:${mock.id}:${scenario.name}`;
  item.description = [active && "in force", scenario.description].filter(Boolean).join(" · ");
  item.iconPath = new vscode.ThemeIcon(active ? "pass-filled" : "circle-large-outline");
  item.contextValue = active ? "courier.scenario.active" : "courier.scenario";
  if (!active)
    item.command = {
      title: "Switch to This Scenario",
      command: "courier.mock.scenario",
      arguments: [node],
    };
  return item;
}
