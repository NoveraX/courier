import * as vscode from "vscode";

import { readsCalls } from "../hints/hint-document";
import type { HintStore } from "../hints/hint-store";
import type { StudioTarget } from "../projects/studio-targets";
import type { CallSite } from "../studio/studio-types";
import { createDefinitionLenses } from "./definition-lenses";
import { createDefinitionProvider } from "./definition-provider";
import type { DefinitionStore } from "./definition-store";
import { createEndpointSymbols } from "./endpoint-symbols";
import { createReferenceProvider } from "./reference-provider";

/** What registering the code features needs. */
export interface CodeFeatureDeps {
  readonly selector: vscode.DocumentSelector;
  readonly store: HintStore;
  readonly definitions: DefinitionStore;
  fetchSites(studio: string, source: string, endpoint: string): Promise<CallSite[]>;
  targets(): Promise<readonly StudioTarget[]>;
  /** Whether the hints are on: the lines over declarations follow them */
  enabled(): boolean;
}

/** The code features, and what keeps them up to date. */
export interface CodeFeatures extends vscode.Disposable {
  /** Show the lines over declarations again: Studio's figures moved */
  refreshed(): void;
}

/**
 * Register what the editor learns of the project's endpoints from Studio:
 * Go to Definition from any call, Find All References from a call or a
 * declaration, the lines and the hover over each declaration, and the
 * endpoints in Go to Symbol in Workspace. A saved file may have moved a
 * declaration, so the declarations are asked again after one.
 *
 * @param deps - What the features read
 * @returns The features
 * @example
 * ```ts
 * const code = registerCodeFeatures({ selector, store, definitions, fetchSites, targets, enabled });
 * ```
 */
export function registerCodeFeatures(deps: CodeFeatureDeps): CodeFeatures {
  const { selector, store, definitions, fetchSites } = deps;
  const lenses = createDefinitionLenses(store, definitions, fetchSites, deps.enabled);
  const held = vscode.Disposable.from(
    vscode.languages.registerDefinitionProvider(
      selector,
      createDefinitionProvider(store, definitions),
    ),
    vscode.languages.registerReferenceProvider(
      selector,
      createReferenceProvider(store, definitions, fetchSites),
    ),
    vscode.languages.registerCodeLensProvider(selector, lenses),
    vscode.languages.registerHoverProvider(selector, lenses),
    vscode.languages.registerWorkspaceSymbolProvider(
      createEndpointSymbols(deps.targets, definitions),
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!readsCalls(document)) return;
      definitions.forget();
      lenses.refreshed();
    }),
  );
  return { refreshed: lenses.refreshed, dispose: () => held.dispose() };
}
