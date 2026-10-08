import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import type * as Testing from "@noverax/courier-mock/testing";
import { type ArgsDef, defineCommand } from "citty";

import { loadCourierConfig } from "../server/config-loader";
import { messageOf } from "../server/message-of";
import { devInstallCommand } from "../server/mocks-edit/install-command";
import { type FoundRecordings, findRecordings } from "./verify/find-recordings";
import {
  type CheckedFile,
  markdownReport,
  type SkippedFile,
  textReport,
  totalsOf,
} from "./verify/verify-report";

const log = createLogger("Verify");

/** The `verify` command's options. */
export const VERIFY_ARGS = {
  format: {
    type: "string",
    valueHint: "text|markdown|json",
    description: "How the report is written (default: text)",
  },
  out: {
    type: "string",
    valueHint: "path",
    description: "Write the report to this file too — a pull request comment, $GITHUB_STEP_SUMMARY",
  },
  ignore: {
    type: "string",
    valueHint: "endpoints",
    description:
      "Endpoints left unchecked, comma-separated: orders.get,admin.*,payments:charges.create",
  },
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
} as const satisfies ArgsDef;

/**
 * `courier-studio verify` — check every recorded call against the API
 * definition as `courier.config.ts` declares it now, and fail when one no
 * longer fits: the CI step beside the recorded tests Studio saves. It reads
 * the HAR files named, or every one in the folders named — `tests/recorded`
 * by default — and sends nothing anywhere.
 *
 * @example
 * ```sh
 * courier-studio verify tests/recorded --format markdown --out "$GITHUB_STEP_SUMMARY"
 * ```
 */
export const verifyCommand = defineCommand({
  meta: { name: "verify", description: "Check recorded calls against the API definition" },
  args: VERIFY_ARGS,
  async run({ args }) {
    try {
      process.exitCode = (await verify(args)) ? 0 : 1;
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  },
});

async function verify(args: {
  _: string[];
  format?: string | undefined;
  out?: string | undefined;
  ignore?: string | undefined;
  cwd?: string | undefined;
}): Promise<boolean> {
  const format = args.format ?? "text";
  if (format !== "text" && format !== "markdown" && format !== "json") {
    throw new Error(`--format takes text, markdown or json, not ${format}`);
  }
  const root = resolve(args.cwd ?? process.cwd());
  const recordings = findRecordings(root, args._);
  const testing = await loadTesting(root);
  const { config } = await loadCourierConfig(root);
  const ignore = (args.ignore ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const { files, skipped } = await checkAll(root, recordings, config.sources, testing, ignore);
  const report =
    format === "json"
      ? `${JSON.stringify({ totals: totalsOf(files), files, skipped }, null, 2)}\n`
      : format === "markdown"
        ? markdownReport(files, skipped)
        : textReport(files, skipped);
  process.stdout.write(report);
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), report);
  }
  return totalsOf(files).broken === 0;
}

async function checkAll(
  root: string,
  { named, found }: FoundRecordings,
  sources: object,
  testing: typeof Testing,
  ignore: readonly string[],
): Promise<{ files: CheckedFile[]; skipped: SkippedFile[] }> {
  const files: CheckedFile[] = [];
  const skipped: SkippedFile[] = [];
  for (const path of [...named, ...found]) {
    const file = relative(root, path) || path;
    let recordings: Testing.Fixture[];
    try {
      recordings = testing.readRecordings(path);
    } catch (error) {
      /* A browser's own HAR in a folder is not a recording; one named outright must be. */
      if (named.includes(path)) throw error;
      skipped.push({ file, reason: messageOf(error) });
      continue;
    }
    files.push({ file, checks: await testing.verifyRecordings(sources, recordings, { ignore }) });
  }
  return { files, skipped };
}

async function loadTesting(root: string): Promise<typeof Testing> {
  try {
    return await import("@noverax/courier-mock/testing");
  } catch (error) {
    throw new Error(
      `courier-studio verify needs @noverax/courier-mock, which could not be loaded (${messageOf(error).split("\n", 1)[0]}). Install it with ${devInstallCommand(root, "@noverax/courier-mock")}.`,
    );
  }
}
