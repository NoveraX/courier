import * as vscode from "vscode";

import { ago, formatMs } from "../hints/hint-text";
import type { CourierProject } from "../projects/courier-projects";
import type { StudioTarget } from "../projects/studio-targets";
import type { RecordedRequest } from "../studio/live-types";

/** A row of the Requests view. */
export type RequestNode =
  | { readonly kind: "project"; readonly project: CourierProject; readonly studio: string }
  | { readonly kind: "request"; readonly studio: string; readonly request: RecordedRequest }
  | { readonly kind: "note"; readonly id: string; readonly text: string };

/** The Requests view's rows. */
export interface RequestsView extends vscode.TreeDataProvider<RequestNode> {
  /** Draw the rows again: new requests came */
  refreshed(): void;
  /** Show the failed requests alone, or all of them */
  failedOnly(on: boolean): void;
}

type FetchRequests = (
  studio: string,
  wanted: { failed?: boolean; limit?: number },
) => Promise<RecordedRequest[]>;

/* A sidebar shows the latest; Studio's Timeline holds them all. */
const SHOWN = 50;

/**
 * The Requests view: the latest requests each Studio recorded, newest
 * first — or the failed ones alone — each with its method, status, how
 * long it took and when; a click opens it in Studio's inspector. A
 * monorepo lists each project's apart.
 *
 * @param targets - The Studios that run for the workspace
 * @param fetchRequests - What asks a Studio for its requests
 * @returns The view's rows
 * @example
 * ```ts
 * const requests = createRequestsView(core.view.targets, fetchRequests);
 * ```
 */
export function createRequestsView(
  targets: () => Promise<readonly StudioTarget[]>,
  fetchRequests: FetchRequests,
): RequestsView {
  const changed = new vscode.EventEmitter<undefined>();
  let failed = false;
  const requestsOf = async (studio: string): Promise<RequestNode[]> => {
    const requests = await fetchRequests(studio, { failed, limit: SHOWN }).catch(() => undefined);
    const note = (text: string): RequestNode[] => [{ kind: "note", id: `note:${studio}`, text }];
    if (requests === undefined) return note("Courier Studio did not answer");
    if (requests.length === 0)
      return note(
        failed ? "No request has failed" : "No request yet: use the app, and its calls show here",
      );
    return requests.map((request) => ({ kind: "request", studio, request }));
  };
  return {
    onDidChangeTreeData: changed.event,
    refreshed: () => changed.fire(undefined),
    failedOnly(on) {
      failed = on;
      changed.fire(undefined);
    },
    getTreeItem: (node) => requestItem(node, Date.now()),
    async getChildren(node) {
      if (node?.kind === "project") return requestsOf(node.studio);
      if (node) return [];
      const running = (await targets()).flatMap((target) => (target.studio ? [target] : []));
      const [only] = running;
      if (running.length === 1 && only?.studio) return requestsOf(only.studio);
      return running.flatMap((target) =>
        target.project && target.studio
          ? [{ kind: "project", project: target.project, studio: target.studio }]
          : [],
      );
    },
  };
}

function requestItem(node: RequestNode, now: number): vscode.TreeItem {
  if (node.kind === "project") {
    const item = new vscode.TreeItem(node.project.name, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `requests:${node.studio}`;
    item.iconPath = new vscode.ThemeIcon("pulse");
    return item;
  }
  if (node.kind === "note") {
    const item = new vscode.TreeItem(node.text);
    item.id = node.id;
    item.iconPath = new vscode.ThemeIcon("info");
    return item;
  }
  const { request, studio } = node;
  const item = new vscode.TreeItem(request.endpoint);
  item.id = `request:${studio}:${request.id}`;
  const outcome =
    request.state === "pending"
      ? "in flight"
      : request.status !== undefined
        ? String(request.status)
        : request.state;
  const took = request.durationMs !== undefined ? formatMs(request.durationMs) : undefined;
  item.description = [request.method, outcome, took, ago(now - request.startedAt)]
    .filter(Boolean)
    .join(" · ");
  item.tooltip = [
    `${request.method ?? ""} ${request.source}.${request.endpoint}`.trim(),
    request.error,
  ]
    .filter(Boolean)
    .join("\n");
  item.iconPath = stateIcon(request.state);
  item.contextValue = "courier.request";
  item.command = { title: "Open in Studio", command: "courier.request.open", arguments: [node] };
  return item;
}

function stateIcon(state: RecordedRequest["state"]): vscode.ThemeIcon {
  if (state === "error")
    return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
  if (state === "pending") return new vscode.ThemeIcon("loading~spin");
  return new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed"));
}
