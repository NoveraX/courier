import { createLogger } from "@noverax/courier";
import { styleFor } from "@noverax/courier/internal";

import { SetupFailure } from "./apply/setup-failure";
import { CancelledError } from "./cancelled-error";
import { type JsonReport, jsonReport } from "./report/json-report";
import { textReport } from "./report/text-report";
import type { SetupIO } from "./setup-io";

/** A command that sets Courier up, as its entry runs it. */
export interface SetupCommand {
  /** Its name, as the JSON document gives it: `create-courier`, `courier-cli setup`. */
  readonly command: string;
  readonly version: string;
  /** The scope its log lines are written under: `Create`, `Setup`. */
  readonly logScope: string;
  /** Whether it reports one JSON document, `--json`, rather than lines for a person. */
  readonly json: boolean;
  /** Why it cannot run here at all, before anything is read: the Node.js running it. */
  readonly cannotRun?: (() => string | undefined) | undefined;
}

/* A plain Error is a refusal the command words for the person; anything else is what it did not expect. */
function isRefusal(error: unknown): error is Error {
  return error instanceof Error && error.constructor === Error;
}

/**
 * Run a command that sets Courier up: with lines for a person at the
 * terminal, who answers its questions, or — with `--json` — with one
 * JSON document on standard output, asking nothing, the output of the
 * programs it runs on standard error. However it ends — done, refused,
 * failed, cancelled — it says so in the same report, and gives the
 * status the process exits with.
 *
 * @param command - The command, and how it reports
 * @param work - What it does, told where to report and whether to ask
 * @returns The exit status
 * @example
 * ```ts
 * process.exitCode = await runSetupCommand({ command: "create-courier", version, json: args.json === true }, (io) => createCourier(args, io));
 * ```
 */
export async function runSetupCommand(
  command: SetupCommand,
  work: (io: SetupIO) => Promise<number>,
): Promise<number> {
  const json = command.json ? jsonReport(command.command, command.version) : undefined;
  const io: SetupIO = {
    interactive: !command.json && process.stdin.isTTY === true && process.stderr.isTTY === true,
    report:
      json ??
      textReport(styleFor(process.stdout), (lines) =>
        process.stdout.write(`${lines.join("\n")}\n`),
      ),
    toolOutput: command.json ? "stderr" : "stdout",
  };
  const status = await outcome(command, io, json, work);
  if (json) process.stdout.write(json.document(status));
  return status;
}

/* Run the work, and tell how it stopped where it threw: in the JSON document, or as a log line with a stack only for the unexpected. */
async function outcome(
  command: SetupCommand,
  io: SetupIO,
  json: JsonReport | undefined,
  work: (io: SetupIO) => Promise<number>,
): Promise<number> {
  const log = createLogger(command.logScope);
  const cannot = command.cannotRun?.();
  if (cannot !== undefined) {
    json?.stopped("refused", "NODE_TOO_OLD", cannot);
    if (json === undefined) log.error(cannot);
    return 1;
  }
  try {
    return await work(io);
  } catch (error) {
    if (error instanceof CancelledError) {
      process.stderr.write(`\n${error.message}.\n`);
      return error.status;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (json !== undefined) {
      if (error instanceof SetupFailure) json.stopped("failed", error.code, message);
      else if (isRefusal(error)) json.stopped("refused", "REFUSED", message);
      else json.stopped("failed", "UNEXPECTED_ERROR", message);
    } else if (error instanceof SetupFailure || isRefusal(error)) log.error(message);
    else log.error(error instanceof Error && error.stack !== undefined ? error.stack : message);
    return 1;
  }
}
