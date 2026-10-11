import * as vscode from "vscode";

import type { HintStore } from "../hints/hint-store";
import type { EndpointDefinition } from "../studio/studio-types";
import type { DefinitionStore } from "./definition-store";
import { endpointAt } from "./endpoint-at";
import { rangeOf } from "./ranges";

/**
 * Go to an endpoint's declaration from a call to it — also from the name a
 * hook takes as a string, `q.orders.useQuery("list")`, which TypeScript
 * cannot follow. A call that may reach endpoints of two sources goes to
 * both. The place matches the one TypeScript gives where it can follow, so
 * the editor shows it once.
 *
 * @param store - Where the files' calls are placed
 * @param definitions - Where the endpoints are declared
 * @returns The provider
 * @example
 * ```ts
 * vscode.languages.registerDefinitionProvider(selector, createDefinitionProvider(store, definitions));
 * ```
 */
export function createDefinitionProvider(
  store: HintStore,
  definitions: DefinitionStore,
): vscode.DefinitionProvider {
  return {
    async provideDefinition(document, position) {
      const at = await endpointAt(store, definitions, document, position);
      if (!at || !("call" in at)) return undefined;
      const all = await definitions.definitionsFor(at.studio);
      const origin = rangeOf(at.call);
      const links = at.call.endpoints.flatMap(({ source, endpoint }) =>
        all
          .filter((each) => each.source === source && each.endpoint === endpoint)
          .map((each) => linkTo(each, origin)),
      );
      return links.length > 0 ? links : undefined;
    },
  };
}

function linkTo(definition: EndpointDefinition, origin: vscode.Range): vscode.LocationLink {
  return {
    originSelectionRange: origin,
    targetUri: vscode.Uri.file(definition.path),
    targetRange: rangeOf(definition.span),
    targetSelectionRange: rangeOf(definition),
  };
}
