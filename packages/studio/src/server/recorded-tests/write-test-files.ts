import { dirname } from "node:path";
import {
  assertRealInside,
  ensureDirectory,
  projectRootAt,
  resolveProjectPath,
  writeFileAtomically,
} from "@noverax/courier-cli/devkit";
import type { RecordedTestPlan } from "./recorded-test-plan";
import { RecordedTestRefusal } from "./recorded-test-refusal";

/**
 * Write a recorded test's files into the project, each whole or not at all:
 * its folder created inside the project, no file written through a link,
 * and a file already there replaced only when the person agreed to it.
 *
 * @param root - The project root
 * @param plan - The plan, made again for this write
 * @param replace - Whether a file already there may be replaced
 * @returns The files written, by project-relative path
 * @throws {RecordedTestRefusal} `FILE_EXISTS`, naming the files, when replacing was not agreed to
 * @throws {PathOutsideProjectError} When a file would land outside the project
 * @example
 * ```ts
 * writeTestFiles(root, plan, false); // ["tests/recorded/checkout.shop.har", "tests/recorded/checkout.test.ts"]
 * ```
 */
export function writeTestFiles(root: string, plan: RecordedTestPlan, replace: boolean): string[] {
  const there = plan.files.filter((file) => file.replaces).map((file) => file.path);
  if (there.length > 0 && !replace) {
    throw new RecordedTestRefusal(
      "FILE_EXISTS",
      `${there.join(", ")} ${there.length === 1 ? "is" : "are"} there already: agree to replace ${there.length === 1 ? "it" : "them"}, or name the test differently.`,
    );
  }
  const project = projectRootAt(root);
  for (const file of plan.files) {
    const path = resolveProjectPath(project.path, file.path);
    ensureDirectory(project, dirname(path));
    assertRealInside(project, path);
    writeFileAtomically(path, file.content, ".courier-test");
  }
  return plan.files.map((file) => file.path);
}
