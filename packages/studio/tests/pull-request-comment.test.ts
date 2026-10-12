/**
 * The diff report on a pull request: the pull request is read from the
 * environment GitHub Actions gives a job, and the report is posted as one
 * comment per project — found again by its mark on the next run, across
 * pages of comments, and edited only when the report changed. Only a comment
 * the token's own identity wrote is taken for the report, whoever else
 * writes the mark. A definition that did not change starts no comment; a
 * report too long for a comment is cut at a line; GitHub's refusal says what
 * the job lacks.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { postReportComment } from "../src/commands/diff/pull-request-comment";
import { type PullRequestTarget, pullRequestOf } from "../src/commands/diff/pull-request-target";

interface Comment {
  id: number;
  body: string;
  user?: { login: string; type: "User" | "Bot" };
}

interface FakeGitHub {
  target: PullRequestTarget;
  comments: Comment[];
  calls: string[];
  headers: IncomingMessage["headers"][];
}

interface FakeOptions {
  /** A refusal for every call. */
  refuse?: { status: number; message: string };
  /** The person the token belongs to; left out, it is an app's token, posting as the Actions bot. */
  person?: string;
  /** How GitHub answers `/user`, when not as it does for the token. */
  user?: { status: number; message: string };
}

const BOT = { login: "github-actions[bot]", type: "Bot" } as const;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

/* GitHub's issue comment routes for pull request 12 of acme/shop, as a token's owner sees them. */
async function fakeGitHub({ refuse, person, user }: FakeOptions = {}): Promise<FakeGitHub> {
  const comments: Comment[] = [];
  const calls: string[] = [];
  const headers: IncomingMessage["headers"][] = [];
  const author = person ? ({ login: person, type: "User" } as const) : BOT;
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const url = new URL(req.url ?? "/", "http://github.test");
    calls.push(`${req.method} ${url.pathname}${url.search}`);
    headers.push(req.headers);
    const send = (status: number, value: unknown) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    if (refuse) return send(refuse.status, { message: refuse.message });
    if (req.method === "GET" && url.pathname === "/user") {
      if (user) return send(user.status, { message: user.message });
      if (person) return send(200, { login: person, type: "User" });
      return send(403, { message: "Resource not accessible by integration" });
    }
    if (req.method === "GET" && url.pathname === "/repos/acme/shop/issues/12/comments") {
      const size = Number(url.searchParams.get("per_page"));
      const page = Number(url.searchParams.get("page"));
      return send(200, comments.slice((page - 1) * size, page * size));
    }
    if (req.method === "POST" && url.pathname === "/repos/acme/shop/issues/12/comments") {
      const comment = { id: 1000 + comments.length, body: JSON.parse(text).body, user: author };
      comments.push(comment);
      return send(201, comment);
    }
    const edited = /^\/repos\/acme\/shop\/issues\/comments\/(\d+)$/.exec(url.pathname);
    const comment = comments.find((one) => one.id === Number(edited?.[1]));
    if (req.method === "PATCH" && comment) {
      comment.body = JSON.parse(text).body;
      return send(200, comment);
    }
    return send(404, { message: "Not Found" });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    target: { api, repository: "acme/shop", number: 12, token: "job-token" },
    comments,
    calls,
    headers,
  };
}

const REPORT = "## API definition changes\n\n**1 endpoint changed: 1 breaking**\n";

describe("the report on a pull request", () => {
  it("is posted once, found by its mark on a later page, and edited only when it changed", async () => {
    const github = await fakeGitHub();
    for (let n = 0; n < 100; n++) github.comments.push({ id: n, body: `Review ${n}` });

    const first = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT,
      changed: true,
    });
    const again = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT,
      changed: true,
    });
    const edited = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT.replace("1 breaking", "2 breaking"),
      changed: true,
    });

    expect([first, again, edited]).toEqual(["created", "unchanged", "updated"]);
    expect(github.comments.slice(100)).toEqual([
      {
        id: 1100,
        body: "<!-- courier-studio diff: . -->\n## API definition changes\n\n**1 endpoint changed: 2 breaking**\n",
        user: BOT,
      },
    ]);
    expect(github.calls.filter((call) => !call.startsWith("GET"))).toEqual([
      "POST /repos/acme/shop/issues/12/comments",
      "PATCH /repos/acme/shop/issues/comments/1100",
    ]);
    expect(github.calls).toContain("GET /repos/acme/shop/issues/12/comments?per_page=100&page=2");
    expect(github.headers[0]).toMatchObject({
      authorization: "Bearer job-token",
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    });
  });

  it("starts no comment for a definition that did not change, and edits one posted before", async () => {
    const github = await fakeGitHub();

    const quiet = await postReportComment(github.target, {
      project: "apps/shop",
      markdown: "## API definition changes\n\n**No endpoint changed**\n",
      changed: false,
    });
    expect(quiet).toBe("skipped");
    expect(github.comments).toEqual([]);

    await postReportComment(github.target, {
      project: "apps/shop",
      markdown: REPORT,
      changed: true,
    });
    await postReportComment(github.target, {
      project: "apps/admin",
      markdown: REPORT,
      changed: true,
    });
    github.comments[0] = {
      id: 1000,
      body: (github.comments[0]?.body ?? "").replaceAll("\n", "\r\n"),
      user: BOT,
    };
    const resolved = await postReportComment(github.target, {
      project: "apps/shop",
      markdown: "## API definition changes\n\n**No endpoint changed**\n",
      changed: false,
    });

    expect(resolved).toBe("updated");
    expect(github.comments.map((comment) => comment.body.split("\n")[0])).toEqual([
      "<!-- courier-studio diff: apps/shop -->",
      "<!-- courier-studio diff: apps/admin -->",
    ]);
    expect(github.comments[0]?.body).toContain("No endpoint changed");
    expect(github.comments[1]?.body).toContain("1 breaking");
  });

  it("cuts a report too long for a comment at a line, closing the fold it cut", async () => {
    const github = await fakeGitHub();
    const safe = Array.from(
      { length: 2000 },
      (_, n) => `- \`shop orders.f${n}\`: ${"x".repeat(40)}`,
    );
    const markdown = `${REPORT}\n<details><summary>2000 safe changes</summary>\n\n${safe.join("\n")}\n\n</details>\n`;

    await postReportComment(github.target, { project: ".", markdown, changed: true });

    const body = github.comments[0]?.body ?? "";
    expect(body.length).toBeLessThanOrEqual(65_536);
    expect(body).toMatch(
      /x\n\n<\/details>\n\n\*\*The report is longer than a comment holds: the whole of it is in the job's log\.\*\*\n$/,
    );
  });

  it("says what the job lacks when GitHub refuses", async () => {
    const github = await fakeGitHub({
      refuse: { status: 403, message: "Resource not accessible by integration" },
    });

    await expect(
      postReportComment(github.target, { project: ".", markdown: REPORT, changed: true }),
    ).rejects.toThrow(
      "GitHub answered GET /repos/acme/shop/issues/12/comments with 403: Resource not accessible by integration — the job needs `permissions: pull-requests: write`, and a pull request from a fork gets a token that cannot write",
    );
  });
});

/**
 * Anyone who may comment on the pull request can write the mark first. The
 * job then edited their comment, which its author could rewrite after it to
 * say anything, or failed on it; only the token's own identity's comment is
 * the report.
 */
describe("a comment someone else marked", () => {
  const MARK = "<!-- courier-studio diff: . -->";
  const forged = (id: number, login: string, type: "User" | "Bot" = "User"): Comment => ({
    id,
    body: `${MARK}\n## API definition changes\n\n**No endpoint changed**\n`,
    user: { login, type },
  });

  it("is left alone, and the job's own report posted beside it and kept current", async () => {
    const github = await fakeGitHub();
    github.comments.push(forged(7, "mallory"), forged(8, "renovate[bot]", "Bot"));
    const forgeries = structuredClone(github.comments);

    const first = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT,
      changed: true,
    });
    const again = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT,
      changed: true,
    });
    const quiet = await postReportComment(github.target, {
      project: ".",
      markdown: "## API definition changes\n\n**No endpoint changed**\n",
      changed: false,
    });

    expect([first, again, quiet]).toEqual(["created", "unchanged", "updated"]);
    expect(github.comments.slice(0, 2)).toEqual(forgeries);
    expect(github.comments[2]).toMatchObject({ id: 1002, user: BOT });
    expect(github.calls.filter((call) => !call.startsWith("GET"))).toEqual([
      "POST /repos/acme/shop/issues/12/comments",
      "PATCH /repos/acme/shop/issues/comments/1002",
    ]);
  });

  it("starts no comment of its own for a definition that did not change", async () => {
    const github = await fakeGitHub();
    github.comments.push(forged(7, "mallory"));

    const outcome = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT,
      changed: false,
    });

    expect(outcome).toBe("skipped");
    expect(github.calls.filter((call) => !call.startsWith("GET"))).toEqual([]);
  });

  it("is told from the report of a person's token, named by GitHub in any case", async () => {
    const github = await fakeGitHub({ person: "Octo-Dev" });
    github.comments.push(forged(7, "mallory"), forged(8, "github-actions[bot]", "Bot"));
    github.comments.push({ ...forged(9, "octo-dev"), body: `${MARK}\n${REPORT}` });

    const outcome = await postReportComment(github.target, {
      project: ".",
      markdown: REPORT.replace("1 breaking", "2 breaking"),
      changed: true,
    });

    expect(outcome).toBe("updated");
    expect(github.calls).toContain("GET /user");
    expect(github.calls.filter((call) => !call.startsWith("GET"))).toEqual([
      "PATCH /repos/acme/shop/issues/comments/9",
    ]);
  });

  it("asks who the token is only once a comment carries the mark", async () => {
    const github = await fakeGitHub();

    await postReportComment(github.target, { project: ".", markdown: REPORT, changed: true });

    expect(github.calls).not.toContain("GET /user");
  });

  it("says so when GitHub cannot say who the token is", async () => {
    const github = await fakeGitHub({ user: { status: 502, message: "Bad Gateway" } });
    github.comments.push(forged(7, "mallory"));

    await expect(
      postReportComment(github.target, { project: ".", markdown: REPORT, changed: true }),
    ).rejects.toThrow("GitHub answered GET /user with 502: Bad Gateway");
    expect(github.calls.filter((call) => !call.startsWith("GET"))).toEqual([]);
  });
});

describe("the pull request a job runs for", () => {
  const event = (value: unknown) => {
    const path = join(mkdtempSync(join(tmpdir(), "courier-event-")), "event.json");
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  const job = {
    GITHUB_TOKEN: "job-token",
    GITHUB_REPOSITORY: "acme/shop",
    GITHUB_API_URL: "https://github.acme.test/api/v3/",
  };

  it("is the one the event names, on GitHub Enterprise Server too", () => {
    expect(
      pullRequestOf({ ...job, GITHUB_EVENT_PATH: event({ pull_request: { number: 12 } }) }),
    ).toEqual({
      api: "https://github.acme.test/api/v3",
      repository: "acme/shop",
      number: 12,
      token: "job-token",
    });
    expect(
      pullRequestOf({
        GH_TOKEN: "gh-token",
        GITHUB_REPOSITORY: "acme/shop",
        GITHUB_EVENT_PATH: event({ issue: { number: 7, pull_request: {} } }),
      }),
    ).toMatchObject({ api: "https://api.github.com", number: 7, token: "gh-token" });
  });

  it("is none, saying why, outside a pull request's job", () => {
    expect(pullRequestOf({ ...job, GITHUB_EVENT_PATH: event({ ref: "refs/heads/main" }) })).toBe(
      "the job does not run for a pull request — run it on pull_request",
    );
    expect(pullRequestOf({ ...job, GITHUB_EVENT_PATH: event({ issue: { number: 7 } }) })).toBe(
      "the job does not run for a pull request — run it on pull_request",
    );
    expect(pullRequestOf({ GITHUB_REPOSITORY: "acme/shop" })).toBe(
      "no token — pass the job's token to the step as GITHUB_TOKEN",
    );
    expect(pullRequestOf({ GITHUB_TOKEN: "job-token" })).toBe(
      "GITHUB_REPOSITORY names no repository — --comment posts from a GitHub Actions job",
    );
    expect(pullRequestOf(job)).toBe(
      "GITHUB_EVENT_PATH is not set — --comment posts from a GitHub Actions job",
    );
  });
});
