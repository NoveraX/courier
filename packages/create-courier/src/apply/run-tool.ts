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
  | { readonly kind: "lines"; readonly line: (line: string) => void }
  /** Kept out of sight; its end is kept for a failure to show. */
  | { readonly kind: "quiet" };

/** How a program is run. */
export interface ToolOptions {
  /** Where it runs. */
  readonly cwd: string;
  readonly output: ToolOutput;
  /** Whether the person at the terminal can answer it: a generator run without questions cannot. */
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

/* Stop a program and what it started: Windows ends a process tree with taskkill, others take a signal, then a harder one. */
function stopTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on(
      "error",
      () => child.kill(),
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
  const { output, input = "inherit" } = options;
  if (output.kind !== "show") return ["ignore", "pipe", "pipe"];
  return output.on === "stdout" ? [input, "inherit", "inherit"] : [input, 2, 2];
}

/**
 * Run a program in the project, within its time: past it — or once the
 * person cancels — it is stopped with what it started, and the result
 * says why. What it prints is shown as it comes, read a line at a time,
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
  const line = options.output.kind === "lines" ? options.output.line : undefined;
  /* One reader for each stream, so a line half-printed on one never runs into the other's. */
  const readers = [new ToolOutputReader(line), new ToolOutputReader(line)] as const;
  const tail = () => readers.map((reader) => reader.tail).join("");
  return new Promise((done, fail) => {
    if (options.signal?.aborted) {
      done({ status: 1, stopped: "cancelled", tail: "" });
      return;
    }
    const env = options.env === undefined ? undefined : { ...process.env, ...options.env };
    const child = spawn(program, args, { cwd: options.cwd, stdio: stdioOf(options), shell, env });
    let stopped: ToolResult["stopped"];
    const stop = (why: NonNullable<ToolResult["stopped"]>) => {
      stopped ??= why;
      stopTree(child);
    };
    const timer = setTimeout(() => stop("deadline"), options.deadlineMs);
    const onAbort = () => stop("cancelled");
    options.signal?.addEventListener("abort", onAbort, { once: true });
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
    };
    child.on("error", (error) => {
      settle();
      fail(new Error(`${program} could not be started: ${error.message}`, { cause: error }));
    });
    child.on("close", (status) => {
      settle();
      done({ status: status ?? 1, ...(stopped ? { stopped } : {}), tail: tail() });
    });
  });
}
