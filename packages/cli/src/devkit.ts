/**
 * The project tooling Courier Studio and the CLI share: reading and writing
 * a project's files without leaving it, formatting them as the project
 * does, its `.env` files, its tsconfig and module conventions, the processes
 * long work runs in, and the routes module. Studio imports it from here, so
 * both write the same bytes. It is Courier's own, not a public API: its
 * shape follows what Studio needs, release to release.
 */
export { createProjectEnv, DOTENV_ARG, loadProjectEnv, type ProjectEnv } from "./project-env";
export { findFormatters, type ProjectFormatters } from "./project-format/find-formatters";
export { formatProjectFiles } from "./project-format/format-project-files";
export { closeFormatProcesses } from "./project-format/formatter-host";
export { assertOpenedInside } from "./project-fs/assert-opened-inside";
export { assertRealInside } from "./project-fs/assert-real-inside";
export { assertResolvesInside } from "./project-fs/assert-resolves-inside";
export { discardTemp } from "./project-fs/discard-temp";
export { ensureDirectory, missingDirectories } from "./project-fs/ensure-directory";
export { flushDirectories } from "./project-fs/flush-directories";
export { flushFiles } from "./project-fs/flush-files";
export { isWithin } from "./project-fs/is-within";
export { PathOutsideProjectError } from "./project-fs/path-outside-project-error";
export { type ProjectRoot, projectRootAt } from "./project-fs/project-root";
export { readFileInside } from "./project-fs/read-file-inside";
export { readProjectText } from "./project-fs/read-project-text";
export { resolveProjectPath } from "./project-fs/resolve-project-path";
export { retryOnWin32 } from "./project-fs/retry-on-win32";
export { syncDirectory } from "./project-fs/sync-directory";
export { writeFileAtomically } from "./project-fs/write-file-atomically";
export { writeTempBeside } from "./project-fs/write-temp-beside";
export { composeRoutesModule } from "./routes-module/compose-routes-module";
export { routesExportName } from "./routes-module/routes-export-name";
export { routesModulePath } from "./routes-module/routes-module-path";
export { routesModuleText } from "./routes-module/routes-module-text";
export {
  createRoutesModuleWriter,
  type LoadedForRoutes,
} from "./routes-module/routes-module-writer";
export { routesSaid } from "./routes-module/routes-said";
export { routesSettingProblem } from "./routes-module/routes-setting-problem";
export { writeRoutesModule } from "./routes-module/write-routes-module";
export { importsCarryExtensions } from "./source/imports-carry-extensions";
export { packageTypeOf } from "./source/package-type-of";
export {
  type CommentEnds,
  type ParsedSource,
  type ParseProblem,
  parseSource,
} from "./source/parse-source";
export { resolvedRoot } from "./source/resolved-root";
export { usesNodeResolution } from "./source/uses-node-resolution";
export { writesExplicitExtensions } from "./source/writes-explicit-extensions";
export { describeValue } from "./util/describe-value";
export { errnoCode } from "./util/errno-code";
export { isRecord } from "./util/is-record";
export { messageOf } from "./util/message-of";
export { NotRegularFileError } from "./util/not-regular-file-error";
export { type RegularFile, readRegularFile } from "./util/read-regular-file";
export { JOB_MEMORY_CAP } from "./worker/job-memory-cap";
export { startWorkerProcess, stopWorkerProcess, type WorkerProcess } from "./worker/worker-process";
export { FORMAT_WORKER_SCRIPT, JOB_MEMORY_WATCH_SCRIPT } from "./worker/worker-scripts";
