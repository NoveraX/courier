import { runTool } from "../apply/run-tool";
import { SETUP_LIMITS } from "../limits";

/** Whether git can tell Courier's changes to a project from the person's own. */
export type GitState =
  /** Nothing is changed but not committed: what the setup changes is all git will show. */
  | { readonly kind: "clean" }
  /** Changes not committed, a few of them named, and how many there are. */
  | { readonly kind: "dirty"; readonly paths: readonly string[]; readonly count: number }
  /** No history to go back to, or none git would tell: outside a repository, without git, or git did not answer. */
  | { readonly kind: "unknown"; readonly why: string };

/* The changes named in the plan: enough to see what they are. */
const PATHS_NAMED = 5;

/**
 * Whether the project has changes git has not committed: its own folder's
 * files, those git does not track among them. git is asked without taking
 * its index's lock — a status another program runs at the same moment is
 * not refused for it — within its time; without the fsmonitor a
 * repository's config may name, so no hook of the repository's runs and
 * no daemon is left behind; and in the C locale, so that what it says of
 * a folder outside a repository reads the same in any language.
 *
 * @param root - The project's folder
 * @param git - The program, `git` from the PATH
 * @returns What git says
 * @example
 * ```ts
 * await gitState("/work/shop"); // { kind: "dirty", paths: ["src/app/page.tsx"], count: 1 }
 * ```
 */
export async function gitState(root: string, git = "git"): Promise<GitState> {
  const paths: string[] = [];
  let count = 0;
  const command = [
    git,
    "-c",
    "core.quotePath=false",
    "-c",
    "core.fsmonitor=false",
    "status",
    "--porcelain=v1",
    "--",
    ".",
  ];
  let result: Awaited<ReturnType<typeof runTool>>;
  try {
    result = await runTool(command, {
      cwd: root,
      env: { GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      output: {
        kind: "lines",
        line(line) {
          if (line === "") return;
          count++;
          if (paths.length < PATHS_NAMED) paths.push(line.slice(3));
        },
      },
      deadlineMs: SETUP_LIMITS.gitMs,
    });
  } catch {
    /* git could not be started: there is none on the PATH. */
    return { kind: "unknown", why: "git is not installed, so there is no history to go back to" };
  }
  if (result.stopped === "deadline")
    return { kind: "unknown", why: `git did not answer within ${SETUP_LIMITS.gitMs / 1000} s` };
  if (result.status !== 0) {
    const said = result.tail.trim().split("\n").at(-1) ?? "";
    return /not a git repository/i.test(said)
      ? {
          kind: "unknown",
          why: "it is not in a git repository, so there is no history to go back to",
        }
      : { kind: "unknown", why: `git could not tell its changes: ${said.replace(/^fatal: /, "")}` };
  }
  return count === 0 ? { kind: "clean" } : { kind: "dirty", paths, count };
}
