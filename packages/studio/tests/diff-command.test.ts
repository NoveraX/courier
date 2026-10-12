/**
 * `courier-studio diff`, run as CI runs it on a pull request: the definition
 * in the working tree set against the one at a git ref — checked out in a
 * worktree inside `.courier`, removed afterwards — or in OpenAPI documents
 * written before. It fails on a breaking change, says what breaks and how
 * many recorded calls each changed endpoint has, and passes when asked to
 * fail on nothing; asked to, it posts the report on the pull request.
 */
import { execFile, execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fixturesToHar } from "@noverax/courier-mock/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = join(__dirname, "../src/cli.ts");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

let root: string;

function config(answer: string, agents = ""): string {
  return `import { courier, defineApi } from "@noverax/courier/define";
import { z } from "zod";
const { endpoint } = courier();
export default {
  sources: {
    shop: defineApi({
      baseURL: "https://shop.example",
      endpoints: { order: endpoint.get("orders/:id").variables(z.object({ id: z.string() })).response(${answer}) },
    }),
  },${agents}
};
`;
}

function studio(...args: string[]) {
  return spawnSync(process.execPath, ["--import", TSX, CLI, ...args, "--cwd", root], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

/* The CLI in a child process, while this one answers for GitHub. */
function studioBeside(env: Record<string, string>, ...args: string[]) {
  return new Promise<{ status: number; stdout: string; stderr: string }>((done) => {
    execFile(
      process.execPath,
      ["--import", TSX, CLI, ...args, "--cwd", root],
      { encoding: "utf8", timeout: 60_000, env: { ...process.env, NO_COLOR: "1", ...env } },
      (error, stdout, stderr) =>
        done({ status: typeof error?.code === "number" ? error.code : 0, stdout, stderr }),
    );
  });
}

const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
    cwd: root,
    stdio: "pipe",
  });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "courier-diff-"));
  symlinkSync(resolve(__dirname, "../../../node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  writeFileSync(
    join(root, "courier.config.ts"),
    config("z.object({ id: z.string(), total: z.number() })"),
  );
  git("init", "--quiet");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  writeFileSync(
    join(root, "courier.config.ts"),
    config("z.object({ id: z.string() })", '\n  agents: { offer: "reads" },'),
  );
  mkdirSync(join(root, "tests/recorded"), { recursive: true });
  const recording = {
    source: "shop",
    group: "",
    method: "order",
    variables: { id: "o_1" },
    request: { method: "GET", url: "https://shop.example/orders/o_1" },
    response: { status: 200, data: { id: "o_1", total: 12 }, headers: {} },
    duration: 20,
    recordedAt: "2026-10-09T01:00:00.000Z",
  };
  writeFileSync(
    join(root, "tests/recorded/checkout.shop.har"),
    JSON.stringify(fixturesToHar([recording, recording])),
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("courier-studio diff", () => {
  it("fails on a breaking change against a git ref, with the recorded calls it touches, and leaves no worktree", () => {
    const run = studio("diff", "--base", "HEAD");

    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain("shop order · GET /orders/{id}  (2 recorded calls)");
    expect(run.stdout).toContain("BREAKING  answer.total is no longer in the answer");
    expect(run.stdout).toContain(
      "1 endpoints changed: 1 breaking, 0 that may break, 0 safe; 0 recorded calls no longer fit",
    );
    expect(run.stdout).toContain("Agent access: 1 tool added: agents may call 1 tool");
    expect(run.stdout).toContain('  + shop.order  order  read  offer: "reads"');
    expect(
      readdirSync(join(root, ".courier")).filter((name) => name.startsWith("diff-base-")),
    ).toEqual([]);
    expect(git("worktree", "list").toString().trim().split("\n")).toHaveLength(1);
  }, 60_000);

  it("compares with documents written before, writes Markdown for the pull request, and passes when asked to fail on nothing", () => {
    const documents = join(root, ".courier", "base-openapi");
    git("stash", "--quiet");
    const written = studio("openapi", "--out", join(documents, "shop.openapi.json"));
    git("stash", "pop", "--quiet");
    const summary = join(root, "summary.md");

    const run = studio(
      "diff",
      "--base-openapi",
      documents,
      "--format",
      "markdown",
      "--out",
      summary,
      "--fail-on",
      "never",
    );

    expect(written.status, written.stderr).toBe(0);
    expect(existsSync(join(documents, "shop.openapi.json"))).toBe(true);
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(summary, "utf8")).toContain(
      "| Breaking | `shop order` | answer.total is no longer in the answer | 2 |",
    );
    expect(readFileSync(summary, "utf8")).toContain(
      "## Agent access\n\n**agents may call 1 tool; the base, OpenAPI documents written before, does not record what agents could call**",
    );
  }, 60_000);

  it("posts the report on the pull request the job runs for, its verdict unchanged", async () => {
    const posted: string[] = [];
    const github = createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      if (req.method === "POST") posted.push(JSON.parse(text).body);
      res.writeHead(req.method === "POST" ? 201 : 200, { "content-type": "application/json" });
      res.end(req.method === "POST" ? JSON.stringify({ id: 1 }) : "[]");
    });
    await new Promise<void>((done) => github.listen(0, "127.0.0.1", done));
    const event = join(root, ".courier", "event.json");
    writeFileSync(event, JSON.stringify({ pull_request: { number: 12 } }));

    try {
      const run = await studioBeside(
        {
          GITHUB_TOKEN: "job-token",
          GITHUB_REPOSITORY: "acme/shop",
          GITHUB_EVENT_PATH: event,
          GITHUB_API_URL: `http://127.0.0.1:${(github.address() as AddressInfo).port}`,
          GITHUB_WORKSPACE: root,
        },
        "diff",
        "--base",
        "HEAD",
        "--comment",
      );
      const unposted = await studioBeside(
        { GITHUB_TOKEN: "" },
        "diff",
        "--base",
        "HEAD",
        "--comment",
      );

      expect(run.status, run.stderr).toBe(1);
      expect(run.stdout).toContain("BREAKING  answer.total is no longer in the answer");
      expect(`${run.stdout}${run.stderr}`).toContain("Posted the report on pull request #12");
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatch(/^<!-- courier-studio diff: \. -->\n## API definition changes\n/);
      expect(posted[0]).toContain(
        "| Breaking | `shop order` | answer.total is no longer in the answer | 2 |",
      );
      expect(unposted.status).toBe(1);
      expect(`${unposted.stdout}${unposted.stderr}`).toContain(
        "The report is not posted on a pull request: no token — pass the job's token to the step as GITHUB_TOKEN",
      );
    } finally {
      await new Promise((done) => github.close(done));
    }
  }, 60_000);
});

describe("courier-studio diff, for a project in a folder of its repository", () => {
  it("reads the definition at the ref from the same folder", () => {
    const repository = mkdtempSync(join(tmpdir(), "courier-diff-repository-"));
    const project = join(repository, "apps", "shop");
    mkdirSync(project, { recursive: true });
    symlinkSync(resolve(__dirname, "../../../node_modules"), join(project, "node_modules"), "dir");
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
    writeFileSync(join(repository, ".gitignore"), "node_modules\n");
    writeFileSync(
      join(project, "courier.config.ts"),
      config("z.object({ id: z.string(), total: z.number() })"),
    );
    const commit = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args],
        {
          cwd: repository,
          stdio: "pipe",
        },
      );
    commit("init", "--quiet");
    commit("add", ".");
    commit("commit", "--quiet", "-m", "base");
    writeFileSync(join(project, "courier.config.ts"), config("z.object({ id: z.string() })"));

    const run = spawnSync(
      process.execPath,
      ["--import", TSX, CLI, "diff", "--base", "HEAD", "--cwd", project],
      { encoding: "utf8", timeout: 60_000, env: { ...process.env, NO_COLOR: "1" } },
    );
    rmSync(repository, { recursive: true, force: true });

    expect(run.status, run.stderr).toBe(1);
    expect(run.stdout).toContain("BREAKING  answer.total is no longer in the answer");
  }, 60_000);
});
