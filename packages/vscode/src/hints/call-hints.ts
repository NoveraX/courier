import * as vscode from "vscode";

import type { EndpointCall } from "../studio/studio-types";
import { hintDocument } from "./hint-document";
import type { HintStore } from "./hint-store";
import { figuresOf, hintTitle, hoverText } from "./hint-text";
import { studioMarkdown } from "./studio-markdown";

/** The hints over endpoint calls: a line above each, or at the end of its line, and a hover over it. */
export interface CallHints
  extends vscode.CodeLensProvider,
    vscode.InlayHintsProvider,
    vscode.HoverProvider {
  /** Show the hints again: Studio's figures changed, or a setting did */
  refreshed(): void;
}

/** Where the hints go: a line above each call, or the end of the call's own line. */
export type HintStyle = "codeLens" | "inlay";

/**
 * The hints over each call to an endpoint: above it — or at the end of its
 * line, as the settings say — how the endpoint's calls went in Studio, a
 * click opening the endpoint there; and over the call, the figures in full.
 * A file Studio does not run for shows none.
 *
 * @param store - What the hints know
 * @param enabled - Whether the hints are on
 * @param style - Where they go
 * @returns The providers
 * @example
 * ```ts
 * const hints = createCallHints(store, () => true, () => "codeLens");
 * vscode.languages.registerCodeLensProvider(selector, hints);
 * ```
 */
export function createCallHints(
  store: HintStore,
  enabled: () => boolean,
  style: () => HintStyle = () => "codeLens",
): CallHints {
  const changed = new vscode.EventEmitter<void>();
  const shown = (document: vscode.TextDocument, wanted: HintStyle) =>
    enabled() && style() === wanted && document.uri.scheme === "file";
  return {
    onDidChangeCodeLenses: changed.event,
    onDidChangeInlayHints: changed.event,
    refreshed: () => changed.fire(),
    async provideCodeLenses(document, token) {
      if (!shown(document, "codeLens")) return [];
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
    async provideInlayHints(document, range, token) {
      if (!shown(document, "inlay")) return [];
      const placed = await store.callsIn(hintDocument(document));
      if (!placed || token.isCancellationRequested) return [];
      return placed.calls.flatMap((call) => {
        const end = document.lineAt(call.endLine - 1).range.end;
        if (!range.contains(end)) return [];
        return lensesOf(call).flatMap(({ source, endpoint, withSource }) => {
          const stats = store.statsOf(placed.studio, source, endpoint);
          if (!stats) return [];
          /*
           * The call names its endpoint, and the editor cuts a hint past 43 characters: the figures
           * go alone, a request's calls in flight left to the tooltip — a stream's open ones stay.
           */
          const open = stats.kind === "stream" || stats.kind === "channel";
          const figures = figuresOf(open ? stats : { ...stats, pending: 0 });
          const label = withSource ? `${stats.source} · ${figures}` : figures;
          const part = new vscode.InlayHintLabelPart(label);
          part.tooltip = studioMarkdown(hoverText(stats, placed.studio, Date.now()));
          part.command = {
            title: "Open in Courier Studio",
            command: "courier.openInStudio",
            arguments: [placed.studio, source, endpoint],
          };
          const hint = new vscode.InlayHint(end, [part]);
          hint.paddingLeft = true;
          return [hint];
        });
      });
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
