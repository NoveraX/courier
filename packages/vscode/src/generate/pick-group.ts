import * as vscode from "vscode";

import type { GroupPlace } from "../studio/studio-types";

/**
 * The group a new endpoint goes in: the one asked for; else the one picked,
 * the group whose endpoints the cursor is among offered first.
 *
 * @param groups - Where the project's groups write their endpoints
 * @param known - The source and group asked for, when they are
 * @returns The group, or `undefined` when none is picked
 * @example
 * ```ts
 * const place = await pickGroup(groups, { source: "shop", group: "orders" });
 * ```
 */
export async function pickGroup(
  groups: readonly GroupPlace[],
  known: { readonly source?: string | undefined; readonly group?: string | undefined },
): Promise<GroupPlace | undefined> {
  const asked = groups.find((each) => each.source === known.source && each.group === known.group);
  if (asked) return asked;
  if (groups.length === 0) {
    void vscode.window.showInformationMessage(
      "Courier Studio found no group whose endpoints a file of the project writes.",
    );
    return undefined;
  }
  const here = groupAtCursor(groups);
  const items = [...groups]
    .sort((a, b) =>
      a === here
        ? -1
        : b === here
          ? 1
          : `${a.source}.${a.group}`.localeCompare(`${b.source}.${b.group}`),
    )
    .map((place) => ({
      label: place.group || place.source,
      description: `${place.group ? `${place.source} · ` : "the source itself · "}${place.file}`,
      place,
    }));
  return (await vscode.window.showQuickPick(items, { title: "New Endpoint: its group" }))?.place;
}

function groupAtCursor(groups: readonly GroupPlace[]): GroupPlace | undefined {
  const editor = vscode.window.activeTextEditor;
  const line = (editor?.selection.active.line ?? -1) + 1;
  return groups.find(
    (place) =>
      place.path === editor?.document.uri.fsPath &&
      place.open.line <= line &&
      line <= place.close.line,
  );
}
