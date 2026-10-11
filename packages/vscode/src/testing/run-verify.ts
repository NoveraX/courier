import { execFile } from "node:child_process";

import { type VerifyReport, verifyReportOf } from "./verify-report";

/** What a run of verify gave: its report, or what it said instead. */
export type VerifyOutcome =
  | { readonly report: VerifyReport; readonly printed: string }
  | { readonly failure: string };

/* A project's recordings are checked in seconds; one that takes longer is stuck. */
const LONGEST_MS = 5 * 60_000;

/**
 * Run `courier-studio verify` for some of a project's recordings, by the
 * package's full name from the project's folder, and read its report. A
 * broken call makes the command fail, and still prints the report; what
 * it prints instead — the package missing, the config not loading — is
 * the failure.
 *
 * @param root - The project's folder
 * @param files - The recordings, relative to it
 * @param signal - Stops the run
 * @returns The report, or the failure
 * @example
 * ```ts
 * const outcome = await runVerify("/work/shop", ["tests/recorded/checkout.har"]);
 * ```
 */
export function runVerify(
  root: string,
  files: readonly string[],
  signal?: AbortSignal,
): Promise<VerifyOutcome> {
  const args = ["@noverax/courier-studio", "verify", ...files, "--format", "json"];
  return new Promise((done) => {
    execFile(
      "npx",
      args,
      {
        cwd: root,
        signal,
        timeout: LONGEST_MS,
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === "win32",
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        const report = verifyReportOf(String(stdout));
        if (report) done({ report, printed: String(stdout) });
        else
          done({
            failure:
              String(stderr).trim() || error?.message || "courier-studio verify printed no report",
          });
      },
    );
  });
}
