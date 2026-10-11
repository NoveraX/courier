import * as vscode from "vscode";

import type { StudioTarget } from "../projects/studio-targets";
import { studioAtHand } from "../studio/studio-at-hand";
import type { StudioFinder } from "../studio/studio-in-front";
import type { GroupPlace } from "../studio/studio-types";
import {
  endpointSnippet,
  insertion,
  METHODS,
  type NewEndpoint,
  nameProblem,
} from "./endpoint-snippet";
import { pickGroup } from "./pick-group";

/** What adding an endpoint needs. */
export interface NewEndpointDeps {
  readonly studioFor: StudioFinder;
  targets(): Promise<readonly StudioTarget[]>;
  fetchGroups(studio: string): Promise<GroupPlace[]>;
}

/** What is already known of the endpoint to add; the rest is asked. */
export interface NewEndpointArgs {
  readonly source?: string | undefined;
  readonly group?: string | undefined;
  readonly name?: string | undefined;
  readonly method?: NewEndpoint["method"] | undefined;
  readonly path?: string | undefined;
}

const METHOD_ITEMS = METHODS.map((method) => ({
  label: method === "del" ? "DELETE" : method.toUpperCase(),
  description: {
    get: "read",
    post: "create",
    put: "replace",
    patch: "change",
    del: "remove",
    query: "search, the question in the body",
  }[method],
  method,
}));

/**
 * Add an endpoint to a group, as its file writes them: the group picked —
 * the one the cursor is in, or the one asked for — its name, method and
 * path asked, and the endpoint typed in after the group's last one, its
 * variables and response to fill in, step by step.
 *
 * @param deps - What adding needs
 * @param known - What is already known; the rest is asked
 * @example
 * ```ts
 * await newEndpoint(deps, { source: "shop", group: "orders" });
 * ```
 */
export async function newEndpoint(
  deps: NewEndpointDeps,
  known: NewEndpointArgs = {},
): Promise<void> {
  const studio = await studioAtHand(deps.studioFor, deps.targets);
  if (!studio) {
    const start = await vscode.window.showInformationMessage(
      "Courier Studio finds where your groups write their endpoints: start it, then add the endpoint.",
      "Start Studio",
    );
    if (start) await vscode.commands.executeCommand("courier.startStudio");
    return;
  }
  const groups = await deps.fetchGroups(studio).catch((): GroupPlace[] => []);
  const place = await pickGroup(groups, known);
  if (!place) return;
  const name = known.name ?? (await askName(place));
  const method =
    known.method ??
    (await vscode.window.showQuickPick(METHOD_ITEMS, { title: "New Endpoint: its method" }))
      ?.method;
  if (name === undefined || method === undefined) return;
  const path =
    known.path ??
    (await vscode.window.showInputBox({
      title: "New Endpoint: its path",
      prompt: "After the group's prefix: :id names a variable, empty is the prefix itself",
      value: suggestedPath(name),
    }));
  if (path === undefined) return;
  await typeIn(place, { name, method, path });
}

function askName(place: GroupPlace): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    title: "New Endpoint: its name",
    prompt: `The call the client makes: ${place.group ? `${place.group}.` : ""}name`,
    validateInput: (name) => nameProblem(name, place.names),
  });
}

/* `get` and `getById` take an id; `list` and `all` are the prefix itself; the rest by their words. */
function suggestedPath(name: string): string {
  if (/^(get|getById|one|find)$/.test(name)) return ":id";
  if (/^(list|all|getAll|index)$/.test(name)) return "";
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/*
 * The line breaks and the indent go in as text, exactly; the endpoint goes in after them as a snippet of one
 * line, which the editor types through — a snippet of several lines would have its lines indented again.
 */
async function typeIn(place: GroupPlace, wanted: NewEndpoint): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(place.path));
  const editor = await vscode.window.showTextDocument(document);
  const { insertSpaces, tabSize } = editor.options;
  const unit =
    insertSpaces === false ? "\t" : " ".repeat(typeof tabSize === "number" ? tabSize : 2);
  const offsetAt = (line: number, column: number) =>
    document.offsetAt(new vscode.Position(line - 1, column - 1));
  const at = insertion(document.getText(), offsetAt, place, unit);
  await editor.edit((edit) => edit.insert(document.positionAt(at.offset), at.before + at.after), {
    undoStopBefore: true,
    undoStopAfter: false,
  });
  const snippet = new vscode.SnippetString(endpointSnippet(place.builder ?? "endpoint", wanted));
  await editor.insertSnippet(snippet, document.positionAt(at.offset + at.before.length), {
    undoStopBefore: false,
    undoStopAfter: true,
  });
}
