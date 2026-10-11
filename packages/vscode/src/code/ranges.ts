import * as vscode from "vscode";

import type { CallSite, EndpointCall, TextSpan } from "../studio/studio-types";

/**
 * A stretch Studio names — lines and columns from 1, the end just past it —
 * as the editor counts it, from 0.
 *
 * @param span - The stretch
 * @returns The range
 * @example
 * ```ts
 * rangeOf({ line: 9, column: 5, endLine: 9, endColumn: 10 }); // 8:4–8:9
 * ```
 */
export function rangeOf(span: TextSpan | EndpointCall): vscode.Range {
  return new vscode.Range(span.line - 1, span.column - 1, span.endLine - 1, span.endColumn - 1);
}

/**
 * Where a call site is, as the editor marks it: its name, or where it
 * starts for a Studio that does not say where the name ends.
 *
 * @param site - The call site
 * @returns Its location
 * @example
 * ```ts
 * siteLocation(site).uri.fsPath; // "/work/shop/src/cart.ts"
 * ```
 */
export function siteLocation(site: CallSite): vscode.Location {
  const start = new vscode.Position(site.line - 1, site.column - 1);
  const end =
    site.endLine !== undefined && site.endColumn !== undefined
      ? new vscode.Position(site.endLine - 1, site.endColumn - 1)
      : start;
  return new vscode.Location(vscode.Uri.file(site.path), new vscode.Range(start, end));
}
