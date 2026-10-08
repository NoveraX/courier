import { existsSync } from "node:fs";
import { posix, relative, resolve, sep } from "node:path";
import type * as Testing from "@noverax/courier-mock/testing";

import { resolveProjectPath } from "../project-fs/resolve-project-path";
import type { RecordedCalls } from "./recorded-calls";
import type { RecordedTestDeps, RecordedTestInput } from "./recorded-test-plan";
import { RecordedTestRefusal } from "./recorded-test-refusal";
import { testFileText } from "./test-file-text";

/** A file a recorded test writes, by project-relative path. */
export interface PlannedFile {
  path: string;
  content: string;
  /** Whether a file is there already, which writing replaces */
  replaces: boolean;
}

/**
 * The files of a recorded test, in its folder: one HAR file of recordings
 * per source — `checkout.shop.har`, which a mock's `fixtures` can answer
 * from too — and the test, `checkout.test.ts`, that checks them all.
 *
 * @param input - The title and the folder
 * @param calls - The recordings, by source
 * @param deps - The project root and the config's file
 * @param testing - The mock package's testing tools, which write a HAR log
 * @returns The files, the test last
 * @throws {RecordedTestRefusal} When no call has an answer to check
 * @throws {PathOutsideProjectError} When the folder is not inside the project
 * @example
 * ```ts
 * testFiles({ title: "Checkout", folder: "tests/recorded", requests }, calls, deps, testing);
 * ```
 */
export function testFiles(
  input: RecordedTestInput,
  calls: RecordedCalls,
  deps: RecordedTestDeps,
  testing: Pick<typeof Testing, "fixturesToHar">,
): PlannedFile[] {
  if (calls.bySource.size === 0) {
    throw new RecordedTestRefusal(
      "NO_ANSWERED_CALLS",
      "None of these requests has an answer to check: each is still in flight, aborted, a stream, or made to a source the config no longer has.",
    );
  }
  const folder = resolveProjectPath(deps.root, input.folder);
  const at = (name: string) => toPosix(relative(deps.root, resolve(folder, name)));
  const slug = slugOf(input.title, "recorded");
  const hars = [...calls.bySource].map(([source, fixtures]) => ({
    path: at(`${slug}.${slugOf(source, "source")}.har`),
    content: `${JSON.stringify(testing.fixturesToHar(fixtures), null, 2)}\n`,
  }));
  const first = [...calls.bySource.values()].flat()[0];
  const test = testFileText({
    title: input.title,
    recordedOn: localDay(first ? Date.parse(first.recordedAt) : Date.now()),
    configImport: importPath(folder, deps.configFile),
    recordings: hars.map((file) => posix.basename(file.path)),
  });
  return [...hars, { path: at(`${slug}.test.ts`), content: test }].map((file) => ({
    ...file,
    replaces: existsSync(resolve(deps.root, file.path)),
  }));
}

function slugOf(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || fallback;
}

/* The config's module as the test imports it: relative, without its extension, which Vite resolves. */
function importPath(folder: string, configFile: string): string {
  const path = toPosix(relative(folder, configFile)).replace(/\.(?:[cm]?[jt]s)$/, "");
  return path.startsWith(".") ? path : `./${path}`;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/* The day on the person's own clock — Studio runs beside them — as `2026-10-09`. */
function localDay(at: number): string {
  const day = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}`;
}
