import { type ChildProcess, type StdioOptions, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

import { SETUP_LIMITS } from "../limits";
import { spawnable } from "./shell-command";
import { ToolOutputReader } from "./tool-output";

/** What becomes of what a program prints. */
export type ToolOutput =
  /** Shown as it comes, as an install's progress is: on the terminal's output, or on standard error while standard output carries the JSON report. */
  | { readonly kind: "show"; readonly on: "stdout" | "stderr" }
  /** Read a line at a time, as a type check's errors are. */
  | {
      readonly kind: "lines";
      /** Each line, and the stream it came on: a program's answer on standard output, its warnings on standard error. */
      readonly line: (line: string, stream: "stdout" | "stderr") => void;
    }
  /** Kept out of sight; its end is kept for a failure to show. */
  | { readonly kind: "quiet" };

/** How a program is run. */
export interface ToolOptions {
  /** Where it runs. */
  readonly cwd: string;
  readonly output: ToolOutput;
  /**
   * Whether it reads the command's standard input — the person at the
   * terminal, or what was piped in. A program whose output is shown does,
   * unless it is a generator run without questions; one whose output is
   * read does not, unless it is told to. One that reads no terminal runs
   * in a process group of its own, on POSIX, which a stop takes whole.
   */
  readonly input?: "inherit" | "ignore";
  /** Variables it runs with beside the command's own. */
  readonly env?: Readonly<Record<string, string>>;
  /** How long it may run before it is stopped. */
  readonly deadlineMs: number;
  /** Stops it early, once the person cancels. */
  readonly signal?: AbortSignal | undefined;
}

/** How a program ended. */
export interface ToolResult {
  /** Its exit status; 1 where a signal ended it. */
  readonly status: number;
  /** Why it was stopped, where it did not end on its own. */
  readonly stopped?: "deadline" | "cancelled";
  /** The end of what it printed, where its output was read: what its failure shows. */
  readonly tail: string;
}

/**
 * What a program that did not succeed did, in a clause: how it ended, or
 * why it was stopped.
 *
 * @param command - The program and its arguments
 * @param result - How it ended
 * @param deadlineMs - The time it had
 * @returns The clause
 * @example
 * ```ts
 * toolFailure(["npm", "install"], { status: 1, tail: "" }, SETUP_LIMITS.installMs); // "npm install failed (exit 1)"
 * ```
 */
export function toolFailure(
  command: readonly string[],
  result: ToolResult,
  deadlineMs: number,
): string {
  const named = command.join(" ");
  if (result.stopped === "deadline")
    return `${named} was stopped after ${Math.round(deadlineMs / 60_000)} minutes`;
  if (result.stopped === "cancelled") return `${named} was cancelled`;
  return `${named} failed (exit ${result.status})`;
}

/*
 * Whether a program runs in a process group of its own, which a signal
 * stops whole: on POSIX, one that reads no terminal. One that reads the
 * person's terminal stays in its group, where the terminal's Ctrl+C
 * reaches the program and all it started; Windows stops a tree as it is.
 */
function ownGroup(options: ToolOptions): boolean {
  if (process.platform === "win32") return false;
  const input = options.input ?? (options.output.kind === "show" ? "inherit" : "ignore");
  return input === "ignore" || process.stdin.isTTY !== true;
}

/* The signals that stop the process: Ctrl+C at the terminal, and a stop asked of it. */
const STOPS = ["SIGINT", "SIGTERM"] as const;

/* A signal to a process group, which may be gone with all it held. */
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    /* Nothing of it is left. */
  }
}

/*
 * Stop a program, then harder after a grace: Windows ends its tree with
 * taskkill; a group of its own takes the signals whole, what the program
 * started among it; else the program alone takes them.
 */
function stopTree(child: ChildProcess, group: boolean): void {
  const { pid } = child;
  if (pid === undefined) return;
  if (group) {
    signalGroup(pid, "SIGTERM");
    setTimeout(() => signalGroup(pid, "SIGKILL"), SETUP_LIMITS.killGraceMs).unref();
    return;
  }
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("error", () =>
      child.kill(),
    );
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, SETUP_LIMITS.killGraceMs).unref();
}

/* Shown output goes to the terminal's, or to standard error by its descriptor; read output comes through pipes. */
function stdioOf(options: ToolOptions): StdioOptions {
  const { output } = options;
  if (output.kind !== "show") return [options.input ?? "ignore", "pipe", "pipe"];
  const input = options.input ?? "inherit";
  return output.on === "stdout" ? [input, "inherit", "inherit"] : [input, 2, 2];
}

/**
 * Run a program in the project, within its time: past it — or once the
 * person cancels — it is stopped, and the result says why. A program that
 * reads no terminal is stopped with all it started: on POSIX it runs in a
 * process group of its own, which takes the signal, and while it runs the
 * process's own Ctrl+C or SIGTERM stops the group first, then ends the
 * process as it would have, unless the run takes the signal itself. One
 * that reads the person's terminal, an install in it, takes the signal
 * itself, and npm and its like pass it on to the scripts they run; the
 * terminal's Ctrl+C reaches all of it. What it prints is shown as it comes, read a line at a time,
 * or kept out of sight with its end kept; nothing it prints is held whole.
 *
 * @param command - The program and its arguments
 * @param options - Where it runs, what becomes of its output, and how long it may take
 * @returns How it ended
 * @throws {Error} When it cannot be started, or an argument cannot reach it safely
 * @example
 * ```ts
 * const { status } = await runTool(["npm", "install", "zod"], { cwd: root, output: { kind: "show", on: "stdout" }, deadlineMs: SETUP_LIMITS.installMs });
 * ```
 */
export function runTool(command: readonly string[], options: ToolOptions): Promise<ToolResult> {
  const { program, args, shell } = spawnable(command);
  const lines = options.output.kind === "lines" ? options.output.line : undefined;
  const on = (stream: "stdout" | "stderr") =>
    lines === undefined ? undefined : (line: string) => lines(line, stream);
  /* One reader for each stream, so a line half-printed on one never runs into the other's. */
  const readers = [new ToolOutputReader(on("stdout")), new ToolOutputReader(on("stderr"))] as const;
  const tail = () => readers.map((reader) => reader.tail).join("");
  return new Promise((done, fail) => {
    if (options.signal?.aborted) {
      done({ status: 1, stopped: "cancelled", tail: "" });
      return;
    }
    const env = options.env === undefined ? undefined : { ...process.env, ...options.env };
    const group = ownGroup(options);
    const child = spawn(program, args, {
      cwd: options.cwd,
      stdio: stdioOf(options),
      shell,
      env,
      detached: group,
    });
    let stopped: ToolResult["stopped"];
    const stop = (why: NonNullable<ToolResult["stopped"]>) => {
      stopped ??= why;
      stopTree(child, group);
    };
    const timer = setTimeout(() => stop("deadline"), options.deadlineMs);
    const onAbort = () => stop("cancelled");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    /* A group of its own hears no Ctrl+C of the terminal's: a stop the process is asked for stops the group first. */
    let taken: NodeJS.Signals | undefined;
    const onStop = STOPS.map((name) => {
      const listener = () => {
        taken ??= name;
        stop("cancelled");
      };
      return { name, listener };
    });
    if (group) for (const { name, listener } of onStop) process.on(name, listener);
    [child.stdout, child.stderr].forEach((stream, at) => {
      const decoder = new StringDecoder("utf8");
      const reader = readers[at === 0 ? 0 : 1];
      stream?.on("data", (chunk: Buffer) => reader.push(decoder.write(chunk)));
      stream?.on("end", () => {
        reader.push(decoder.end());
        reader.end();
      });
    });
    const settle = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (group) for (const { name, listener } of onStop) process.off(name, listener);
    };
    child.on("error", (error) => {
      settle();
      fail(new Error(`${program} could not be started: ${error.message}`, { cause: error }));
    });
    child.on("close", (status) => {
      settle();
      done({ status: status ?? 1, ...(stopped ? { stopped } : {}), tail: tail() });
      /* A stop nothing else here takes ends the process, as it would have ended it with no program running. */
      if (taken !== undefined && process.listenerCount(taken) === 0)
        process.kill(process.pid, taken);
    });
  });
}
