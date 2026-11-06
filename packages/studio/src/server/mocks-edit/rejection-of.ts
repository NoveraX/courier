import { relative, sep } from "node:path";
import { isRecord } from "@noverax/courier-cli/devkit";
import type { LoadedCourierConfig } from "../config-loader";
import { describeError } from "../describe-error";
import type { MockDeclaration } from "./types";

/**
 * Decide whether a load of the edited files is the edit Studio meant to make.
 *
 * The loaded mocks file must be the one written, every requested mock must be
 * in it as a mock definition serving the very source object the config
 * declares, no mock declared before may have gone, and the config's sources
 * must be the ones they were.
 *
 * @param before - What Studio ran before the edit
 * @param after - The load of the edited files
 * @param requests - The mocks the edit added
 * @param file - The mocks file written: its path in the project root, which has no link to resolve
 * @param root - The project root, symlinks resolved, for messages
 * @returns Why the load is not the intended edit, or `null` when it is
 */
export function rejectionOf(
  before: LoadedCourierConfig,
  after: LoadedCourierConfig,
  requests: readonly MockDeclaration[],
  file: string,
  root: string,
): string | null {
  const loadedProblem = loadedFileProblem(after, file, root);
  if (loadedProblem) return loadedProblem;
  for (const request of requests) {
    const problem = requestProblem(request, after);
    if (problem) return problem;
  }
  return keptProblem(before, after);
}

/**
 * Whether a load of the edited files loaded the file written: it loads,
 * and is the very file Studio wrote.
 *
 * @param after - The load of the edited files
 * @param file - The mocks file written: its path in the project root, which has no link to resolve
 * @param root - The project root, symlinks resolved, for messages
 * @returns Why it did not, or `null` when it did
 */
export function loadedFileProblem(
  after: LoadedCourierConfig,
  file: string,
  root: string,
): string | null {
  const { mocks } = after;
  if (mocks.error !== null)
    return `the mocks file does not load: ${describeError(mocks.error, root)}`;
  if (mocks.file !== file) {
    return `Studio loaded ${mocks.file ? shown(mocks.file, root) : "no mocks file"} rather than ${shown(file, root)}`;
  }
  return null;
}

/**
 * Whether an edit kept what it does not touch: every mock declared before,
 * and the config's sources as they were.
 *
 * @param before - What Studio ran before the edit
 * @param after - The load of the edited files
 * @returns What it lost, or `null` when it lost nothing
 */
export function keptProblem(
  before: LoadedCourierConfig,
  after: LoadedCourierConfig,
): string | null {
  const lost = Object.keys(before.mocks.entries).filter(
    (key) => !Object.hasOwn(after.mocks.entries, key),
  );
  if (lost.length > 0) return `the edit would drop ${lost.join(", ")}`;
  const sourcesBefore = Object.keys(before.config.sources).sort().join(",");
  if (Object.keys(after.config.sources).sort().join(",") !== sourcesBefore) {
    return "the config's sources changed while Studio was editing";
  }
  return null;
}

function requestProblem(request: MockDeclaration, after: LoadedCourierConfig): string | null {
  const entry = Object.hasOwn(after.mocks.entries, request.key)
    ? after.mocks.entries[request.key]
    : undefined;
  if (entry === undefined) return `${request.key} is not declared after the edit`;
  if (!isRecord(entry) || entry.__type !== "courier-mock-server") {
    return `${request.key} is not a defineMockServer() definition`;
  }
  if (!Object.hasOwn(after.config.sources, request.source)) {
    return `courier.config no longer has sources.${request.source}`;
  }
  if (entry.source !== after.config.sources[request.source]) {
    return `${request.key} does not serve the config's sources.${request.source}`;
  }
  return null;
}

function shown(file: string, root: string): string {
  return relative(root, file).split(sep).join("/");
}
