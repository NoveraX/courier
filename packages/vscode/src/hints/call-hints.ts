import * as vscode from "vscode";

import type { EndpointCall } from "../studio/studio-types";
import { hintDocument } from "./hint-document";
import type { HintStore } from "./hint-store";
import { hintTitle, hoverText } from "./hint-text";
import { studioMarkdown } from "./studio-markdown";

/** The hints over endpoint calls: a line above each, and a hover over it. */
export interface CallHints extends vscode.CodeLensProvider, vscode.HoverProvider {
  /** Show the hints again: Studio's figures changed, or a setting did */
  refreshed(): void;
}

/**
 * The hints over each call to an endpoint: above it, how the endpoint's
 * calls went in Studio — a click opens the endpoint there — and over it,
 * the figures in full. A file Studio does not run for shows none.
 *
 * @param store - What the hints know
 * @param enabled - Whether the hints are on
 * @returns The providers
 * @example
 * ```ts
 * const hints = createCallHints(store, () => true);
 * vscode.languages.registerCodeLensProvider(selector, hints);
 * ```
 */
export function createCallHints(store: HintStore, enabled: () => boolean): CallHints {
  const changed = new vscode.EventEmitter<void>();
  return {
    onDidChangeCodeLenses: changed.event,
    refreshed: () => changed.fire(),
    async provideCodeLenses(document, token) {
      if (!enabled() || document.uri.scheme !== "file") return [];
      const placed = await store.callsIn(hintDocument(document));
      if (!placed || token.isCancellationRequested) return [];
      return placed.calls.flatMap((call) =>
        lensesOf(call).flatMap(({ source, endpoint, range, withSource }) => {
          const stats = store.statsOf(placed.studio, source, endpoint);
          if (!stats) return [];
          const command = {
            title: hintTitle(stats, withSource),
            tooltip: "Open this endpoint in Courier Studio",
            command: "courier.openInStudio",
            arguments: [placed.studio, source, endpoint],
          };
          return [new vscode.CodeLens(range, command)];
        }),
      );
    },
    async provideHover(document, position) {
      if (!enabled() || document.uri.scheme !== "file") return undefined;
      const placed = await store.callsIn(hintDocument(document));
      const call = placed?.calls.find((c) => rangeOf(c).contains(position));
      if (!placed || !call) return undefined;
      const texts = call.endpoints.flatMap(({ source, endpoint }) => {
        const stats = store.statsOf(placed.studio, source, endpoint);
        return stats ? [hoverText(stats, placed.studio, Date.now())] : [];
      });
      if (texts.length === 0) return undefined;
      return new vscode.Hover(studioMarkdown(texts.join("\n\n---\n\n")), rangeOf(call));
    },
  };
}

function rangeOf(call: EndpointCall): vscode.Range {
  return new vscode.Range(call.line - 1, call.column - 1, call.endLine - 1, call.endColumn - 1);
}

function lensesOf(call: EndpointCall) {
  const range = rangeOf(call);
  const withSource = call.endpoints.length > 1;
  return call.endpoints.map(({ source, endpoint }) => ({ source, endpoint, range, withSource }));
}
