import { basename } from "node:path";
import * as vscode from "vscode";

import { figuresOf, hoverText } from "../hints/hint-text";
import { studioMarkdown } from "../hints/studio-markdown";
import type { EndpointStats } from "../studio/studio-types";
import { tallyOf } from "./endpoint-groups";
import type { CourierNode } from "./tree-nodes";

const { Collapsed, Expanded, None } = vscode.TreeItemCollapsibleState;

/**
 * How the Courier view draws a row. An endpoint shows how its calls went —
 * failed, all answered, or not called yet — in the colours the editor gives
 * test results, its figures beside it and its full hover as the tooltip.
 * Each row has an id, so what is open stays open as the figures move.
 *
 * @param node - The row
 * @param now - The time now, for how long ago the latest failure was
 * @returns The tree item
 * @example
 * ```ts
 * treeItemOf({ kind: "endpoint", studio, stats }, Date.now()).description; // "34 calls · 1 failed"
 * ```
 */
export function treeItemOf(node: CourierNode, now: number): vscode.TreeItem {
  switch (node.kind) {
    case "project": {
      const item = new vscode.TreeItem(node.project.name, node.studio ? Expanded : None);
      item.id = `project:${node.project.root}`;
      item.description = node.studio ? new URL(node.studio).host : "Studio not running";
      item.tooltip = node.studio
        ? `Courier Studio runs for ${node.project.name} at ${node.studio}`
        : `Courier Studio is not running for ${node.project.name}`;
      item.iconPath = new vscode.ThemeIcon(node.studio ? "pulse" : "circle-slash");
      item.contextValue = node.studio ? "courier.project.running" : "courier.project.stopped";
      return item;
    }
    case "source":
    case "group": {
      const source = node.kind === "source";
      const item = new vscode.TreeItem(
        source ? node.source : node.group.name,
        source ? Expanded : Collapsed,
      );
      item.id = `${node.kind}:${node.studio}:${node.source}:${node.group.path}`;
      item.description = tallyText(tallyOf(node.group));
      item.iconPath = new vscode.ThemeIcon(source ? "server" : "symbol-namespace");
      item.contextValue = `courier.${node.kind}`;
      return item;
    }
    case "endpoint":
      return endpointItem(node.studio, node.stats, now);
    case "site": {
      const { site } = node;
      const item = new vscode.TreeItem(`${basename(site.file)}:${site.line}`, None);
      item.id = `site:${node.studio}:${node.stats.source}.${node.stats.endpoint}:${site.path}:${site.line}:${site.column}`;
      item.description = site.code;
      item.tooltip = `${site.file}:${site.line}:${site.column}\n${site.code}`;
      const file = vscode.Uri.file(site.path);
      /*
       * The row is the call, not the file: its own address takes the file's
       * icon from the icon theme, while the file's marks — its problems, its
       * changes — stay on the file's rows, not read as this call's.
       */
      item.resourceUri = file.with({ fragment: `L${site.line}` });
      item.iconPath = vscode.ThemeIcon.File;
      const at = new vscode.Range(site.line - 1, site.column - 1, site.line - 1, site.column - 1);
      item.command = {
        title: "Open the call",
        command: "vscode.open",
        arguments: [file, { selection: at }],
      };
      return item;
    }
    case "note": {
      const item = new vscode.TreeItem(node.text, None);
      item.id = node.id;
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
  }
}

function endpointItem(studio: string, stats: EndpointStats, now: number): vscode.TreeItem {
  const item = new vscode.TreeItem(stats.endpoint.split(".").at(-1) ?? stats.endpoint, Collapsed);
  item.id = `endpoint:${studio}:${stats.source}.${stats.endpoint}`;
  item.description = figuresOf(stats);
  item.tooltip = studioMarkdown(hoverText(stats, studio, now));
  item.iconPath = stateIcon(stats);
  const state = stats.failed > 0 ? "failing" : stats.calls > 0 ? "succeeding" : "not called yet";
  item.accessibilityInformation = {
    label: `${stats.source}.${stats.endpoint}, ${state}: ${figuresOf(stats)}`,
    role: "treeitem",
  };
  const flags = [stats.failed > 0 && "failed", stats.lastFailure?.request && "latest"];
  item.contextValue = ["courier.endpoint", ...flags.filter(Boolean)].join(".");
  return item;
}

/* The editor's own words for a result: failed, passed, not run yet. */
function stateIcon(stats: EndpointStats): vscode.ThemeIcon {
  if (stats.failed > 0)
    return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
  if (stats.calls > 0)
    return new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed"));
  return new vscode.ThemeIcon("circle-outline", new vscode.ThemeColor("testing.iconUnset"));
}

function tallyText({ endpoints, failing }: { endpoints: number; failing: number }): string {
  const counted = `${endpoints} ${endpoints === 1 ? "endpoint" : "endpoints"}`;
  return failing > 0 ? `${counted} · ${failing} failing` : counted;
}
