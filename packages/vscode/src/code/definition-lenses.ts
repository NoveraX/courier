import * as vscode from "vscode";

import { hintDocument, readsCalls } from "../hints/hint-document";
import type { HintStore } from "../hints/hint-store";
import { figuresOf, hoverText } from "../hints/hint-text";
import { studioMarkdown } from "../hints/studio-markdown";
import { loggedAs } from "../log/courier-log";
import type { CallSite, EndpointDefinition } from "../studio/studio-types";
import type { DefinitionStore } from "./definition-store";
import { rangeOf, siteLocation } from "./ranges";

type FetchSites = (studio: string, source: string, endpoint: string) => Promise<CallSite[]>;

/** The lines over each endpoint's declaration, and the hover over it. */
export interface DefinitionLenses extends vscode.CodeLensProvider, vscode.HoverProvider {
  /** Show the lines again: Studio's figures changed, or a setting did */
  refreshed(): void;
}

/* The line counting the calls in the code: counted only once the editor shows it. */
class SitesLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly studio: string,
    readonly definition: EndpointDefinition,
  ) {
    super(range);
  }
}

/**
 * Over each endpoint's declaration, how its calls went — a click opens it
 * in Studio — and how many places in the code call it — a click lists
 * them; and over its name, the hover the calls show.
 *
 * @param store - What the hints know of Studio's figures
 * @param definitions - Where the endpoints are declared
 * @param fetchSites - What asks Studio where the code calls an endpoint
 * @param enabled - Whether the hints are on
 * @returns The providers
 * @example
 * ```ts
 * const lenses = createDefinitionLenses(store, definitions, fetchSites, () => true);
 * vscode.languages.registerCodeLensProvider(selector, lenses);
 * ```
 */
export function createDefinitionLenses(
  store: HintStore,
  definitions: DefinitionStore,
  fetchSites: FetchSites,
  enabled: () => boolean,
): DefinitionLenses {
  const changed = new vscode.EventEmitter<void>();
  const declaredIn = async (document: vscode.TextDocument) => {
    if (!enabled() || !readsCalls(document)) return undefined;
    const placed = await store.callsIn(hintDocument(document));
    if (!placed) return undefined;
    const here = await definitions.definitionsIn(placed.studio, document.uri.fsPath);
    return { studio: placed.studio, here };
  };
  return {
    onDidChangeCodeLenses: changed.event,
    refreshed: () => changed.fire(),
    async provideCodeLenses(document) {
      const declared = await declaredIn(document);
      if (!declared) return [];
      return declared.here.flatMap((definition) => {
        const range = rangeOf(definition);
        const stats = store.statsOf(declared.studio, definition.source, definition.endpoint);
        const figures = new vscode.CodeLens(range, {
          title: stats ? figuresOf(stats) : "no calls yet",
          tooltip: "Open this endpoint in Courier Studio",
          command: "courier.openInStudio",
          arguments: [declared.studio, definition.source, definition.endpoint],
        });
        return [figures, new SitesLens(range, declared.studio, definition)];
      });
    },
    async resolveCodeLens(lens) {
      if (!(lens instanceof SitesLens)) return lens;
      const { studio, definition } = lens;
      const sites = await fetchSites(studio, definition.source, definition.endpoint).catch(
        loggedAs<CallSite[]>(`Studio at ${studio} did not list the call sites`, []),
      );
      lens.command =
        sites.length === 0
          ? { title: "no call sites", command: "" }
          : {
              title: sites.length === 1 ? "1 call site" : `${sites.length} call sites`,
              tooltip: "Show where the code calls this endpoint",
              command: "editor.action.showReferences",
              arguments: [
                vscode.Uri.file(definition.path),
                lens.range.start,
                sites.map(siteLocation),
              ],
            };
      return lens;
    },
    async provideHover(document, position) {
      const declared = await declaredIn(document);
      const definition = declared?.here.find((each) => rangeOf(each).contains(position));
      if (!declared || !definition) return undefined;
      const stats = store.statsOf(declared.studio, definition.source, definition.endpoint);
      if (!stats) return undefined;
      const text = studioMarkdown(hoverText(stats, declared.studio, Date.now()));
      return new vscode.Hover(text, rangeOf(definition));
    },
  };
}
