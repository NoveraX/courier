import type * as vscode from "vscode";

import { hintDocument, readsCalls } from "../hints/hint-document";
import type { HintStore } from "../hints/hint-store";
import type { EndpointCall, EndpointDefinition, EndpointName } from "../studio/studio-types";
import type { DefinitionStore } from "./definition-store";
import { rangeOf } from "./ranges";

/** What a place in a file names: a call to endpoints, or an endpoint's declaration. */
export type EndpointAt =
  | { readonly studio: string; readonly call: EndpointCall }
  | { readonly studio: string; readonly definition: EndpointDefinition };

/**
 * What a place in a file names, as the project's Studio reads the file: a
 * call to an endpoint — `api.orders.place(…)`, `useQuery("list")` — or an
 * endpoint's declaration in its group.
 *
 * @param store - Where the files' calls are placed
 * @param definitions - Where the endpoints are declared
 * @param document - The file
 * @param position - The place
 * @returns What it names, or `undefined` for anything else, or a file no Studio runs for
 * @example
 * ```ts
 * const at = await endpointAt(store, definitions, document, position);
 * ```
 */
export async function endpointAt(
  store: HintStore,
  definitions: DefinitionStore,
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<EndpointAt | undefined> {
  if (!readsCalls(document)) return undefined;
  const placed = await store.callsIn(hintDocument(document));
  if (!placed) return undefined;
  const call = placed.calls.find((each) => rangeOf(each).contains(position));
  if (call) return { studio: placed.studio, call };
  const here = await definitions.definitionsIn(placed.studio, document.uri.fsPath);
  const definition = here.find((each) => rangeOf(each.span).contains(position));
  return definition && { studio: placed.studio, definition };
}

/**
 * The endpoints a place names: those a call may reach, or the one declared.
 *
 * @param at - What the place names
 * @returns The endpoints
 * @example
 * ```ts
 * endpointsNamed(at); // [{ source: "shop", endpoint: "orders.place" }]
 * ```
 */
export function endpointsNamed(at: EndpointAt): readonly EndpointName[] {
  return "call" in at ? at.call.endpoints : [at.definition];
}
