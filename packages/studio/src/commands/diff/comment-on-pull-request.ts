import { relative } from "node:path";
import { createLogger } from "@noverax/courier";

import { messageOf } from "../../server/message-of";
import { type CommentOutcome, postReportComment } from "./pull-request-comment";
import { type JobEnvironment, pullRequestOf } from "./pull-request-target";

const log = createLogger("Diff");

const SAID: Readonly<Record<CommentOutcome, (number: number) => string>> = {
  created: (number) => `Posted the report on pull request #${number}`,
  updated: (number) => `Updated the report on pull request #${number}`,
  unchanged: (number) => `The report on pull request #${number} is current`,
  skipped: (number) =>
    `The API definition did not change: nothing posted on pull request #${number}`,
};

/**
 * Post the report on the pull request the GitHub Actions job runs for, as
 * one comment for the project that later runs keep current. Posting is a
 * report, not the check: when there is no pull request to post on, or
 * GitHub refuses, the job's log says why and the command's verdict stands.
 *
 * @param root - The project root, which names the comment within the repository
 * @param markdown - The report, as Markdown
 * @param changed - Whether the definition changed at all
 * @param env - The job's environment
 * @example
 * ```ts
 * await commentOnPullRequest(root, diffMarkdown(changed, impact), changed.length > 0);
 * ```
 */
export async function commentOnPullRequest(
  root: string,
  markdown: string,
  changed: boolean,
  env: JobEnvironment = process.env,
): Promise<void> {
  const target = pullRequestOf(env);
  if (typeof target === "string") {
    log.warn(`The report is not posted on a pull request: ${target}`);
    return;
  }
  const project = relative(env.GITHUB_WORKSPACE || process.cwd(), root).replaceAll("\\", "/");
  try {
    const outcome = await postReportComment(target, { project: project || ".", markdown, changed });
    log.info(SAID[outcome](target.number));
  } catch (error) {
    log.warn(`The report is not posted on pull request #${target.number}: ${messageOf(error)}`);
  }
}
