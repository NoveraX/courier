import * as vscode from "vscode";

import { createAuditDiagnostics } from "../audit/audit-diagnostics";
import { createCallHints } from "../hints/call-hints";
import type { CourierCore } from "./courier-core";

/**
 * What the extension marks in the files open: the line above each call to
 * an endpoint and the hover over it, and the audit's findings at the calls
 * they concern — each drawn again when Studio's figures move.
 *
 * @param core - The extension's core
 * @returns What unregisters them
 * @example
 * ```ts
 * context.subscriptions.push(registerEditorMarks(core));
 * ```
 */
export function registerEditorMarks(core: CourierCore): vscode.Disposable {
  const hints = createCallHints(core.store, () =>
    core.settings().get<boolean>("hints.enabled", true),
  );
  const diagnostics = createAuditDiagnostics(core.store, () =>
    core.settings().get<boolean>("audit.diagnostics", true),
  );
  return vscode.Disposable.from(
    vscode.languages.registerCodeLensProvider(core.selector, hints),
    vscode.languages.registerHoverProvider(core.selector, hints),
    diagnostics,
    core.onRedraw(() => {
      hints.refreshed();
      void diagnostics.refresh();
    }),
  );
}
