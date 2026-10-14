import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { DOTENV_ARG, loadProjectEnv } from "@noverax/courier-cli/devkit";
import { type ArgsDef, defineCommand } from "citty";
import { loadCourierConfig } from "../server/config-loader";
import { agentChanges, agentSurfaceOf } from "./diff/agent-access";
import {
  agentAccessMarkdown,
  agentAccessText,
  changesAgentAccess,
} from "./diff/agent-access-report";
import { commentOnPullRequest } from "./diff/comment-on-pull-request";
import { diffDefinitions } from "./diff/definition-diff";
import { definitionAtRef, documentsInFiles, documentsOf } from "./diff/definition-documents";
import { diffMarkdown, diffText, diffTotals } from "./diff/diff-report";
import { recordedImpact } from "./diff/recorded-impact";

const log = createLogger("Diff");

/** The `diff` command's options. */
export const DIFF_ARGS = {
  base: {
    type: "string",
    valueHint: "ref",
    description: "The git ref to compare with: origin/main, a tag, a commit (default: origin/main)",
  },
  "base-openapi": {
    type: "string",
    valueHint: "path",
    description:
      "Compare with OpenAPI documents written before — a folder of <source>.openapi.json, or one file",
  },
  recordings: {
    type: "string",
    valueHint: "path",
    description:
      "Recorded calls to count against each change (default: tests/recorded, when it exists)",
  },
  format: {
    type: "string",
    valueHint: "text|markdown|json",
    description: "How the report is written (default: text)",
  },
  out: {
    type: "string",
    valueHint: "path",
    description: "Write the report to this file too — $GITHUB_STEP_SUMMARY",
  },
  "fail-on": {
    type: "string",
    valueHint: "breaking|warning|never",
    description: "What fails the command (default: breaking)",
  },
  comment: {
    type: "boolean",
    description:
      "Post the report on the pull request the GitHub Actions job runs for, as one comment later runs keep current",
  },
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
  dotenv: DOTENV_ARG,
} as const satisfies ArgsDef;

/**
 * `courier-studio diff` — what a change to the API definition does to its
 * callers: an endpoint removed, a route changed, a field the calls must now
 * send, one gone from the answer, a type narrowed — set against the
 * definition at a git ref or in OpenAPI documents written before, with how
 * many recorded calls each changed endpoint has and how many no longer fit,
 * and what the change does to the tools agents may call. It fails on a
 * breaking change, the CI step for a pull request; with `--comment` the
 * report is posted on the pull request too.
 *
 * @example
 * ```sh
 * courier-studio diff --base origin/main --format markdown --out "$GITHUB_STEP_SUMMARY" --comment
 * ```
 */
export const diffCommand = defineCommand({
  meta: { name: "diff", description: "Report what a change to the API definition breaks" },
  args: DIFF_ARGS,
  async run({ args }) {
    try {
      process.exitCode = (await diff(args)) ? 0 : 1;
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  },
});

async function diff(args: {
  base?: string | undefined;
  "base-openapi"?: string | undefined;
  recordings?: string | undefined;
  format?: string | undefined;
  out?: string | undefined;
  "fail-on"?: string | undefined;
  comment?: boolean | undefined;
  cwd?: string | undefined;
  dotenv?: string | undefined;
}): Promise<boolean> {
  const format = args.format ?? "text";
  const failOn = args["fail-on"] ?? "breaking";
  if (!["text", "markdown", "json"].includes(format))
    throw new Error(`--format takes text, markdown or json, not ${format}`);
  if (!["breaking", "warning", "never"].includes(failOn))
    throw new Error(`--fail-on takes breaking, warning or never, not ${failOn}`);
  const root = resolve(args.cwd ?? process.cwd());
  loadProjectEnv(root, args.dotenv);
  const base = args["base-openapi"]
    ? { documents: documentsInFiles(resolve(root, args["base-openapi"])), agents: undefined }
    : await definitionAtRef(root, args.base ?? "origin/main");
  const { config } = await loadCourierConfig(root);
  const changed = diffDefinitions(base.documents, documentsOf(config.sources));
  const agents = agentChanges(base.agents, agentSurfaceOf(config));
  const impact = await recordedImpact(root, args.recordings, config.sources);
  const markdown = () => `${diffMarkdown(changed, impact)}\n${agentAccessMarkdown(agents)}`;
  const report =
    format === "json"
      ? `${JSON.stringify({ totals: diffTotals(changed), changed, failingRecordings: impact.failing, agents }, null, 2)}\n`
      : format === "markdown"
        ? markdown()
        : `${diffText(changed, impact)}\n${agentAccessText(agents)}`;
  process.stdout.write(report);
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), report);
  }
  if (args.comment)
    await commentOnPullRequest(root, markdown(), changed.length > 0 || changesAgentAccess(agents));
  const { breaking, warnings } = diffTotals(changed);
  return failOn === "never" || (breaking === 0 && (failOn !== "warning" || warnings === 0));
}
