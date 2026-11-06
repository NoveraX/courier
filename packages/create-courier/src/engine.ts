/**
 * The setup's engine that Courier's CLI builds its commands on: the
 * transaction that installs and writes a plan and undoes it when it
 * fails, the checks before it, the reports for a person and for a
 * program, and the reading of a project's manifests and package manager.
 * It is Courier's own, not a public API: its shape follows what the CLI
 * needs, release to release.
 */
export { changedByEdits } from "./apply/apply-plan";
export { runTool, type ToolOptions, type ToolResult, toolFailure } from "./apply/run-tool";
export { type FailureCode, SetupFailure } from "./apply/setup-failure";
export { type Changes, type Done, transact } from "./apply/transaction";
export { type Touched, typecheckTouched } from "./apply/typecheck";
export { withJsonStrings } from "./edit/json-strings";
export { type ChangedLine, changedLines } from "./edit/line-diff";
export { frameworkOf } from "./framework-of";
export type { Plan, PlannedEdit, PlannedFile } from "./plan/build-plan";
export { type GitState, gitState } from "./preflight/git-state";
export { type GoAheadRun, type GoAheadWords, goAhead } from "./preflight/go-ahead";
export { installedVersion } from "./project/installed-package";
export {
  lockfilePaths,
  managerFor,
  type PackageManager,
  type PackageManagerName,
} from "./project/package-manager";
export { manifestOf, type PackageManifest, readProject } from "./project/read-project";
export { isRoutesFramework } from "./recipes/edits/framework-routes";
export type { ManualStep, NextStep } from "./recipes/recipe-types";
export type { PlanView, SetupEnd, SetupReport, UpgradeView } from "./report/setup-report";
export { runSetupCommand, type SetupCommand } from "./run-setup-command";
export type { SetupIO } from "./setup-io";
