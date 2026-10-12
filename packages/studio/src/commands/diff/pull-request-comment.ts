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
/* Who the token GitHub gives a job posts as. It is an app's token, which
   `/user` refuses to name. */
const ACTIONS_BOT = "github-actions[bot]";

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
 * Anyone who may comment can write the mark, so only a comment the token's
 * own identity wrote is taken for the report: someone else's would have the
 * job edit a comment its author can rewrite after it, or fail on it. GitHub
 * names the person a token belongs to, but not an app: an app's token is
 * taken to post as GitHub Actions' bot, as the token a job is given does,
 * and another app's then finds no earlier report and posts a new one.
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
  const send = sender(target, request);
  const github = caller(send);
  const found = await commentWith(github, target, mark, () => posterOf(send));
  if (found) {
    if (found.body.replaceAll("\r\n", "\n") === body) return "unchanged";
    await github("PATCH", `/repos/${target.repository}/issues/comments/${found.id}`, { body });
    return "updated";
  }
  if (!report.changed) return "skipped";
  await github("POST", `/repos/${target.repository}/issues/${target.number}/comments`, { body });
  return "created";
}

type Send = (method: string, path: string, body?: { body: string }) => Promise<Response>;
type GitHubCall = (method: string, path: string, body?: { body: string }) => Promise<unknown>;

function sender(target: PullRequestTarget, request: typeof fetch): Send {
  return (method, path, body) =>
    request(`${target.api}${path}`, {
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
}

function caller(send: Send): GitHubCall {
  return async (method, path, body) => {
    const response = await send(method, path, body);
    if (!response.ok) throw new Error(await refusal(method, path, response));
    return response.json();
  };
}

async function commentWith(
  github: GitHubCall,
  target: PullRequestTarget,
  mark: string,
  poster: () => Promise<string>,
): Promise<{ id: number; body: string } | undefined> {
  let self: string | undefined;
  for (let page = 1; page <= MOST_PAGES; page++) {
    const listed = await github(
      "GET",
      `/repos/${target.repository}/issues/${target.number}/comments?per_page=${PAGE}&page=${page}`,
    );
    const comments: unknown[] = Array.isArray(listed) ? listed : [];
    for (const comment of comments) {
      if (!isObject(comment) || typeof comment.id !== "number") continue;
      const { body } = comment;
      if (typeof body !== "string" || body.split(/\r?\n/, 1)[0] !== mark) continue;
      self ??= await poster();
      if (loginOf(comment.user) === self) return { id: comment.id, body };
    }
    if (comments.length < PAGE) return undefined;
  }
  return undefined;
}

/* Who the token posts as, asked only once a comment carries the mark. A 403 is
   GitHub declining to name an app's token; any other refusal is the call's. */
async function posterOf(send: Send): Promise<string> {
  const response = await send("GET", "/user");
  if (response.status === 403) {
    await response.body?.cancel();
    return ACTIONS_BOT;
  }
  if (!response.ok) throw new Error(await refusal("GET", "/user", response));
  return loginOf(await response.json()) ?? ACTIONS_BOT;
}

/* A login in one case: GitHub's logins are unique whatever their case. */
function loginOf(user: unknown): string | undefined {
  return isObject(user) && typeof user.login === "string" ? user.login.toLowerCase() : undefined;
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
