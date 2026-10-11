import * as vscode from "vscode";

import type { HintStore } from "../hints/hint-store";
import type { CallSite } from "../studio/studio-types";
import type { DefinitionStore } from "./definition-store";
import { endpointAt, endpointsNamed } from "./endpoint-at";
import { rangeOf, siteLocation } from "./ranges";

type FetchSites = (studio: string, source: string, endpoint: string) => Promise<CallSite[]>;

/**
 * Every place the project's code calls an endpoint, from its declaration
 * or from any call to it — the calls a hook names by a string among them,
 * which TypeScript does not count. With the declaration, when the editor
 * asks for it.
 *
 * @param store - Where the files' calls are placed
 * @param definitions - Where the endpoints are declared
 * @param fetchSites - What asks Studio where the code calls an endpoint
 * @returns The provider
 * @example
 * ```ts
 * vscode.languages.registerReferenceProvider(selector, createReferenceProvider(store, definitions, fetchSites));
 * ```
 */
export function createReferenceProvider(
  store: HintStore,
  definitions: DefinitionStore,
  fetchSites: FetchSites,
): vscode.ReferenceProvider {
  return {
    async provideReferences(document, position, context) {
      const at = await endpointAt(store, definitions, document, position);
      if (!at) return undefined;
      const named = endpointsNamed(at);
      const all = await definitions.definitionsFor(at.studio);
      const declared = context.includeDeclaration
        ? all
            .filter((each) =>
              named.some((n) => n.source === each.source && n.endpoint === each.endpoint),
            )
            .map((each) => new vscode.Location(vscode.Uri.file(each.path), rangeOf(each)))
        : [];
      const sites = await Promise.all(
        named.map(({ source, endpoint }) =>
          fetchSites(at.studio, source, endpoint).catch((): CallSite[] => []),
        ),
      );
      return [...declared, ...sites.flat().map(siteLocation)];
    },
  };
}
