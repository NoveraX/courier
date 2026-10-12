import * as vscode from "vscode";

import type { CourierProject, CourierProjects } from "../projects/courier-projects";
import { recordingName } from "./recording-name";
import { runVerify } from "./run-verify";
import { problemText, type VerifyReport } from "./verify-report";

/* Where Studio saves recorded tests, as `courier-studio verify` reads them by default. */
const RECORDINGS = "tests/recorded/**/*.har";

/**
 * The recorded calls Studio saved as tests, in the Test Explorer: each
 * project's recordings, each file holding its calls once run, checked
 * against the API as declared now by `courier-studio verify` — a call the
 * API no longer fits failing with what changed and where its schema
 * refused it. The files are found again as they come and go.
 *
 * @param projects - The workspace's Courier projects
 * @returns What removes the tests
 * @example
 * ```ts
 * context.subscriptions.push(createRecordedTests(projects));
 * ```
 */
export function createRecordedTests(projects: CourierProjects): vscode.Disposable {
  const controller = vscode.tests.createTestController(
    "courier.recordings",
    "Courier recorded calls",
  );
  const owners = new Map<vscode.TestItem, CourierProject>();
  const discover = async () => {
    owners.clear();
    const items: vscode.TestItem[] = [];
    for (const project of await projects.list()) {
      const pattern = new vscode.RelativePattern(project.root, RECORDINGS);
      for (const uri of await vscode.workspace.findFiles(pattern)) {
        const item = controller.createTestItem(
          uri.fsPath,
          recordingName(project.root, uri.fsPath),
          uri,
        );
        item.description = project.name;
        owners.set(item, project);
        items.push(item);
      }
    }
    controller.items.replace(items);
  };
  controller.resolveHandler = (item) => (item ? undefined : discover());
  controller.refreshHandler = () => discover();
  controller.createRunProfile(
    "Check against the API",
    vscode.TestRunProfileKind.Run,
    (request, token) => run(controller, owners, request, token),
    true,
  );
  /* Found at once, not when the Test Explorer first opens: Run All Tests from the palette needs them there. */
  void discover();
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${RECORDINGS}`);
  return vscode.Disposable.from(
    controller,
    watcher,
    watcher.onDidCreate(discover),
    watcher.onDidDelete(discover),
    projects.onDidChange(discover),
  );
}

async function run(
  controller: vscode.TestController,
  owners: ReadonlyMap<vscode.TestItem, CourierProject>,
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
): Promise<void> {
  const testRun = controller.createTestRun(request);
  const files = filesOf(controller, request);
  const stop = new AbortController();
  token.onCancellationRequested(() => stop.abort());
  for (const [project, items] of byProject(files, owners)) {
    for (const item of items) testRun.started(item);
    const outcome = await runVerify(
      project.root,
      items.map((item) => recordingName(project.root, item.id)),
      stop.signal,
    );
    if ("failure" in outcome) {
      for (const item of items) testRun.errored(item, new vscode.TestMessage(outcome.failure));
      continue;
    }
    testRun.appendOutput(outcome.printed.replace(/\n/g, "\r\n"));
    record(controller, testRun, project, items, outcome.report);
  }
  testRun.end();
}

function filesOf(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
): vscode.TestItem[] {
  const asked = request.include
    ? [...request.include]
    : [...controller.items].map(([, item]) => item);
  const files = asked.map((item) => item.parent ?? item);
  const excluded = new Set(request.exclude ?? []);
  return [...new Set(files)].filter((item) => !excluded.has(item));
}

function byProject(
  files: readonly vscode.TestItem[],
  owners: ReadonlyMap<vscode.TestItem, CourierProject>,
): Map<CourierProject, vscode.TestItem[]> {
  const grouped = new Map<CourierProject, vscode.TestItem[]>();
  for (const item of files) {
    const project = owners.get(item);
    if (project) grouped.set(project, [...(grouped.get(project) ?? []), item]);
  }
  return grouped;
}

/* Each file's calls become its children, passed or failed with what changed; a file passed over says why. */
function record(
  controller: vscode.TestController,
  testRun: vscode.TestRun,
  project: CourierProject,
  items: readonly vscode.TestItem[],
  report: VerifyReport,
): void {
  for (const item of items) {
    const file = recordingName(project.root, item.id);
    const checked = report.files.find((each) => each.file === file);
    const skipped = report.skipped.find((each) => each.file === file);
    if (!checked) {
      testRun.skipped(item);
      if (skipped) testRun.appendOutput(`${file} passed over: ${skipped.reason}\r\n`);
      continue;
    }
    /* In the tree before their results: a result for a call the tree does not hold yet is lost. */
    const calls = checked.checks.map((check) => ({
      check,
      call: controller.createTestItem(`${item.id}#${check.at}`, check.label, item.uri),
    }));
    item.children.replace(calls.map(({ call }) => call));
    for (const { check, call } of calls) {
      if (check.problems.length === 0) testRun.passed(call);
      else
        testRun.failed(
          call,
          check.problems.map((problem) => new vscode.TestMessage(problemText(problem))),
        );
    }
    const broken = checked.checks.filter((check) => check.problems.length > 0).length;
    if (broken === 0) testRun.passed(item);
    else
      testRun.failed(
        item,
        new vscode.TestMessage(
          `${broken} of ${checked.checks.length} recorded calls no longer fit the API`,
        ),
      );
  }
}
