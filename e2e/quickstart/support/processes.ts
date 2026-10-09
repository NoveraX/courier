import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createWriteStream, realpathSync } from "node:fs";

/**
 * Start a command in a process group of its own, its output kept in a log.
 *
 * @param command - The program and its arguments
 * @param cwd - Where it runs
 * @param env - Its environment
 * @param log - Where its output goes
 * @returns The process
 * @example
 * ```ts
 * const studio = startLogged(["npm", "run", "studio"], root, process.env, "studio.log");
 * ```
 */
export function startLogged(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log: string,
): ChildProcess {
  const [program = "npx", ...args] = command;
  const child = spawn(program, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = createWriteStream(log);
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return child;
}

/* The processes under one, by parent: a server that makes a process group of its own is still among them. */
function treeOf(root: number): number[] {
  const children = new Map<number, number[]>();
  for (const line of execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }).split("\n")) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (pid === undefined || parent === undefined || Number.isNaN(pid)) continue;
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const tree = [root];
  for (let at = 0; at < tree.length; at += 1) tree.push(...(children.get(tree[at] ?? -1) ?? []));
  return tree;
}

/*
 * The processes whose command line runs from a folder: Astro's dev server
 * runs in a process group of its own and outlives the command that
 * started it, so neither that group nor that tree has it by the time it
 * is stopped, yet it runs the project's own copy of Astro.
 */
function runningFrom(folder: string): number[] {
  const folders = [folder, realpathSync(folder)].map((path) => `${path}/`);
  return execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(.*)$/.exec(line);
      const command = match?.[2] ?? "";
      return folders.some((path) => command.includes(path)) ? [Number(match?.[1])] : [];
    })
    .filter((pid) => pid !== process.pid);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* Signal the group the command started, for what left the tree, and every process in the tree, for what left the group. */
function signal(group: number, pids: readonly number[], name: NodeJS.Signals): void {
  for (const pid of [-group, ...pids]) {
    try {
      process.kill(pid, name);
    } catch {
      /* It has exited already. */
    }
  }
}

async function goneWithin(pids: readonly number[], ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (pids.some(alive)) {
    if (Date.now() >= until) return false;
    await new Promise((done) => setTimeout(done, 200));
  }
  return true;
}

/**
 * Stop a command and every process it started, and every process that
 * runs from the project's folder, and resolve once they have exited:
 * SIGTERM, then SIGKILL for what is left after ten seconds. What is still
 * running would hold its port into the next check, and what is still
 * writing would race the cleanup.
 *
 * @param child - A process `startLogged` started
 * @param folder - The project's folder
 * @example
 * ```ts
 * await stopTree(studio, root);
 * ```
 */
export async function stopTree(child: ChildProcess, folder: string): Promise<void> {
  if (child.pid === undefined) return;
  const pids = [...new Set([...treeOf(child.pid), ...runningFrom(folder)])];
  signal(child.pid, pids, "SIGTERM");
  if (await goneWithin(pids, 10_000)) return;
  signal(child.pid, pids.filter(alive), "SIGKILL");
  await goneWithin(pids, 5_000);
}
