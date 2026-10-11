import * as vscode from "vscode";

import { createCourierTasks, TASK_TYPE } from "../tasks/courier-tasks";
import { createRecordedTests } from "../testing/recorded-tests";
import type { CourierCore } from "./courier-core";

/**
 * Courier in the editor's own workflows: its tasks in Run Task and
 * tasks.json, and the recorded calls Studio saved as tests in the Test
 * Explorer, checked against the API as declared now.
 *
 * @param core - The extension's core
 * @returns What removes them
 * @example
 * ```ts
 * context.subscriptions.push(registerWorkflows(core));
 * ```
 */
export function registerWorkflows(core: CourierCore): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.tasks.registerTaskProvider(TASK_TYPE, createCourierTasks(core.projects)),
    createRecordedTests(core.projects),
  );
}
