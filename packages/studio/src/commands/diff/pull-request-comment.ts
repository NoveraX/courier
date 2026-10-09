import { isObject } from "../../server/validate-body";
import type { PullRequestTarget } from "./pull-request-target";

/** What became of the report on the pull request. */
export type CommentOutcome = "created" | "updated" | "unchanged" | "skipped";

/** The report to post, and the project it is about. */
export interface ReportComment {
  /** The project's folder in the repository, `.` for its root: one comment for each. */
  readonly project: string;
  readonly markdown: string;
  /** Whether the definition changed at all: a report of no change starts no comment. */
  readonly changed: boolean;
}

/* GitHub keeps a comment of up to 65,536 characters; the note on a cut report fits in the rest. */
const LONGEST = 65_000;
const PAGE = 100;
const MOST_PAGES = 30;

/**
 * Post the report on a pull request as one comment, and keep it current:
 * the comment carries a mark naming the project, so the next run finds it
 * and edits it rather than adding another, and a report that has not
 * changed leaves it as it is. A definition that did not change starts no
 * comment, so a pull request that leaves the API alone gets none; one
 * posted before is edited to say so, once the change it reported is gone.
 * A report longer than a comment holds is cut at a line, saying where the
 * whole of it is.
 *
 * @param target - The pull request, and the token that may post on it
 * @param report - The report, and the project it is about
 * @param request - How to call GitHub's REST API
 * @returns What became of the comment
 * @throws {Error} When GitHub refuses a call, with its status and message
 * @example
 * ```ts
 * await postReportComment(target, { project: ".", markdown, changed: true }); // "created"
 * ```
 */
export async function postReportComment(
  target: PullRequestTarget,
  report: ReportComment,
  request: typeof fetch = fetch,
): Promise<CommentOutcome> {
  const mark = `<!-- courier-studio diff: ${report.project.replaceAll("--", "- -")} -->`;
  const body = `${mark}\n${fitted(report.markdown)}`;
  const github = caller(target, request);
  const found = await commentWith(github, target, mark);
  if (found) {
    if (found.body.replaceAll("\r\n", "\n") === body) return "unchanged";
    await github("PATCH", `/repos/${target.repository}/issues/comments/${found.id}`, { body });
    return "updated";
  }
  if (!report.changed) return "skipped";
  await github("POST", `/repos/${target.repository}/issues/${target.number}/comments`, { body });
  return "created";
}

type GitHubCall = (method: string, path: string, body?: { body: string }) => Promise<unknown>;

function caller(target: PullRequestTarget, request: typeof fetch): GitHubCall {
  return async (method, path, body) => {
    const response = await request(`${target.api}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${target.token}`,
        "user-agent": "courier-studio",
        "x-github-api-version": "2022-11-28",
        ...(body && { "content-type": "application/json" }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(await refusal(method, path, response));
    return response.json();
  };
}

async function commentWith(
  github: GitHubCall,
  target: PullRequestTarget,
  mark: string,
): Promise<{ id: number; body: string } | undefined> {
  for (let page = 1; page <= MOST_PAGES; page++) {
    const listed = await github(
      "GET",
      `/repos/${target.repository}/issues/${target.number}/comments?per_page=${PAGE}&page=${page}`,
    );
    const comments: unknown[] = Array.isArray(listed) ? listed : [];
    for (const comment of comments) {
      if (!isObject(comment) || typeof comment.id !== "number") continue;
      const { body } = comment;
      if (typeof body === "string" && body.split(/\r?\n/, 1)[0] === mark)
        return { id: comment.id, body };
    }
    if (comments.length < PAGE) return undefined;
  }
  return undefined;
}

function fitted(markdown: string): string {
  if (markdown.length <= LONGEST) return markdown;
  const line = markdown.lastIndexOf("\n", LONGEST);
  const cut = markdown.slice(0, line < 0 ? LONGEST : line + 1);
  /* A cut inside the folded safe changes closes their fold, or the note would be folded too. */
  const open = cut.lastIndexOf("<details>") > cut.lastIndexOf("</details>");
  return `${cut}${open ? "\n</details>\n" : ""}\n**The report is longer than a comment holds: the whole of it is in the job's log.**\n`;
}

async function refusal(method: string, path: string, response: Response): Promise<string> {
  const said = await response.text();
  let message = said;
  try {
    const parsed: unknown = JSON.parse(said);
    if (isObject(parsed) && typeof parsed.message === "string") message = parsed.message;
  } catch {
    /* Not GitHub's JSON: its text says what went wrong. */
  }
  const hint =
    response.status === 403 || response.status === 404
      ? " — the job needs `permissions: pull-requests: write`, and a pull request from a fork gets a token that cannot write"
      : "";
  return `GitHub answered ${method} ${path.split("?")[0]} with ${response.status}: ${message.slice(0, 300)}${hint}`;
}
