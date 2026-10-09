/**
 * `courier-studio diff`, run as CI runs it on a pull request: the definition
 * in the working tree set against the one at a git ref — checked out in a
 * worktree inside `.courier`, removed afterwards — or in OpenAPI documents
 * written before. It fails on a breaking change, says what breaks and how
 * many recorded calls each changed endpoint has, and passes when asked to
 * fail on nothing.
 */
import { execFileSync, spawnSync } from "node:child_process";
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
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fixturesToHar } from "@noverax/courier-mock/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = join(__dirname, "../src/cli.ts");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

let root: string;

function config(answer: string): string {
  return `import { courier, defineApi } from "@noverax/courier/define";
import { z } from "zod";
const { endpoint } = courier();
export default {
  sources: {
    shop: defineApi({
      baseURL: "https://shop.example",
      endpoints: { order: endpoint.get("orders/:id").variables(z.object({ id: z.string() })).response(${answer}) },
    }),
  },
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
  writeFileSync(join(root, "courier.config.ts"), config("z.object({ id: z.string() })"));
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
    expect(
      readdirSync(join(root, ".courier")).filter((name) => name.startsWith("diff-base-")),
    ).toEqual([]);
    expect(git("worktree", "list").toString().trim().split("\n")).toHaveLength(1);
  });

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
  });
});
