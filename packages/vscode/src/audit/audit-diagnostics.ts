import * as vscode from "vscode";
import { hintDocument, readsCalls } from "../hints/hint-document";
import type { HintStore } from "../hints/hint-store";
import { loggedAs } from "../log/courier-log";
import { fetchFindings } from "../studio/studio-api";
import { auditPage } from "../studio/studio-pages";
import type { Finding } from "../studio/studio-types";
import { findingsAtCalls } from "./findings-at-calls";

/** The audit's findings marked in the files open, kept up to date with Studio's. */
export interface AuditDiagnostics extends vscode.Disposable {
  /** Ask Studio again, at most this often, and mark the files open anew */
  refresh(): Promise<void>;
}

/* The audit reads every request Studio keeps: asked again no more often than this. */
const FRESH_MS = 15_000;
const SEVERITY = {
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
} as const;

/**
 * Mark the findings of Studio's audit at the calls they concern, in the
 * files open: an N+1 pattern where the code asks for each item, a timeout
 * risk where it calls the slow endpoint. They show in the Problems panel
 * under Courier, each linking to Studio's Audit page, and go when Studio
 * stops, the file closes or the setting turns them off.
 *
 * @param store - Where the files' calls are placed
 * @param enabled - Whether the settings let findings be marked
 * @returns The diagnostics
 * @example
 * ```ts
 * const diagnostics = createAuditDiagnostics(store, () => true);
 * await diagnostics.refresh();
 * ```
 */
export function createAuditDiagnostics(store: HintStore, enabled: () => boolean): AuditDiagnostics {
  const collection = vscode.languages.createDiagnosticCollection("courier");
  const asked = new Map<string, { at: number; findings: Promise<Finding[]> }>();

  const findingsOf = (studio: string): Promise<Finding[]> => {
    const known = asked.get(studio);
    if (known && Date.now() - known.at < FRESH_MS) return known.findings;
    const findings = fetchFindings(studio).catch(
      loggedAs<Finding[]>(`Studio at ${studio} did not list the audit's findings`, []),
    );
    asked.set(studio, { at: Date.now(), findings });
    return findings;
  };

  async function mark(document: vscode.TextDocument): Promise<void> {
    if (!readsCalls(document) || !enabled()) {
      collection.delete(document.uri);
      return;
    }
    const placed = await store.callsIn(hintDocument(document));
    /* A Studio that stopped answering leaves no finding behind, however recently it was asked. */
    if (!placed || store.statsFor(placed.studio) === undefined) {
      collection.delete(document.uri);
      return;
    }
    const target = vscode.Uri.parse(auditPage(placed.studio));
    const marks = findingsAtCalls(placed.calls, await findingsOf(placed.studio));
    collection.set(
      document.uri,
      marks.map((mark) => {
        const range = new vscode.Range(
          mark.line - 1,
          mark.column - 1,
          mark.endLine - 1,
          mark.endColumn - 1,
        );
        const diagnostic = new vscode.Diagnostic(range, mark.message, SEVERITY[mark.severity]);
        diagnostic.source = "Courier audit";
        diagnostic.code = { value: mark.finding, target };
        return diagnostic;
      }),
    );
  }

  const markOpen = async () => {
    await Promise.all(vscode.workspace.textDocuments.map(mark));
  };
  const held = [
    collection,
    vscode.workspace.onDidOpenTextDocument((document) => void mark(document)),
    vscode.workspace.onDidSaveTextDocument((document) => void mark(document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
  ];
  return {
    refresh: markOpen,
    dispose() {
      for (const each of held) each.dispose();
    },
  };
}
