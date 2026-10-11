import * as vscode from "vscode";

import type { StudioTarget } from "../projects/studio-targets";
import type { DefinitionStore } from "./definition-store";
import { rangeOf } from "./ranges";

/**
 * The project's endpoints in Go to Symbol in Workspace: each by its call in
 * the client, `orders.place`, its source beside it, at its declaration —
 * found by the letters typed, in order, as the editor finds a symbol.
 *
 * @param targets - The Studios that run for the workspace
 * @param definitions - Where the endpoints are declared
 * @returns The provider
 * @example
 * ```ts
 * vscode.languages.registerWorkspaceSymbolProvider(createEndpointSymbols(view.targets, definitions));
 * ```
 */
export function createEndpointSymbols(
  targets: () => Promise<readonly StudioTarget[]>,
  definitions: DefinitionStore,
): vscode.WorkspaceSymbolProvider {
  return {
    async provideWorkspaceSymbols(query) {
      const studios = (await targets()).flatMap((target) => (target.studio ? [target.studio] : []));
      const all = await Promise.all(studios.map((studio) => definitions.definitionsFor(studio)));
      return all
        .flat()
        .filter((each) => inOrder(`${each.source}.${each.endpoint}`, query))
        .map(
          (each) =>
            new vscode.SymbolInformation(
              each.endpoint,
              vscode.SymbolKind.Method,
              each.source,
              new vscode.Location(vscode.Uri.file(each.path), rangeOf(each)),
            ),
        );
    },
  };
}

/* Whether the letters typed appear in the name in their order: `ordpl` finds `orders.place`. */
function inOrder(name: string, query: string): boolean {
  const lower = name.toLowerCase();
  let at = 0;
  for (const letter of query.toLowerCase()) {
    if (letter === " ") continue;
    at = lower.indexOf(letter, at);
    if (at === -1) return false;
    at += 1;
  }
  return true;
}
