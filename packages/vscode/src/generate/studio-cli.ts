import * as vscode from "vscode";

import type { CourierProject } from "../projects/courier-projects";

/** How a terminal runs one of Courier Studio's commands: the program it starts, and that program's arguments. */
export interface StudioLaunch {
  shellPath: string;
  /* A string on Windows, which VS Code passes as the command line it is. */
  shellArgs: string[] | string;
}

/*
 * The shell takes each argument as a positional one, `"$@"`, never as text it
 * reads, so nothing in an argument is expanded or run; once the command
 * ends, the user's own shell takes the terminal over, as it holds it.
 */
const POSIX_SCRIPT =
  'npx @noverax/courier-studio "$@"; [ -n "$SHELL" ] && exec "$SHELL"; exec /bin/sh';

/* What cmd reads as its own, and the character after a `%`, where cmd starts a variable's name: each escaped with ^. */
const CMD_READS = /[()\][%!^"`<>&|;, *?]|(?<=%)./gs;

/* A word as the C runtime npx's node reads its arguments with takes it whole: quoted, a quote and the backslashes before one escaped. */
function quotedForArgv(word: string): string {
  let quoted = '"';
  let slashes = 0;
  for (const char of word) {
    if (char === "\\") {
      slashes += 1;
      continue;
    }
    quoted += "\\".repeat(char === '"' ? slashes * 2 + 1 : slashes) + char;
    slashes = 0;
  }
  return `${quoted}${"\\".repeat(slashes * 2)}"`;
}

/*
 * A word for cmd, as https://qntm.org/cmd lays it out: quoted for argv, then
 * each character cmd reads as its own escaped with ^ — twice, as npx is a
 * .cmd file, whose %* cmd reads once more. No quote is left for cmd to
 * read, so no ^ goes unread. A `%` is the one ^ does not hold: cmd puts a
 * variable's value in place of %NAME%, %NAME:a=b% or %NAME:~0,4% before it
 * reads any ^, the name running from a `%` to the next or to a `:`. So the
 * character after each `%` is escaped as well, and every name cmd could
 * read starts with a ^, which no variable's does.
 */
function cmdWord(word: string): string {
  return quotedForArgv(word).replace(CMD_READS, "^^^$&");
}

/**
 * How a terminal runs one of Courier Studio's commands — by the package's
 * full name, so npx runs the project's own copy — with each argument passed
 * whole and never read by a shell: on macOS and Linux as `sh`'s positional
 * arguments, then the user's shell; on Windows through `cmd`, every
 * character it reads as its own escaped, then `cmd` on its own. No
 * PowerShell reads the line, which would run a `$(…)` inside an address
 * even in quotes; `cmd` puts no variable's value in place of a `%…%` or
 * `!…!` in it; and no shell keeps it in its history.
 *
 * @param args - The command and its arguments: `["import", spec]`
 * @param platform - The platform the terminal runs on
 * @returns The program the terminal starts, and its arguments
 * @example
 * ```ts
 * studioLaunch(["import", "https://api.example/openapi.json"], "darwin");
 * // → { shellPath: "/bin/sh", shellArgs: ["-c", …, "courier-studio", "import", "https://api.example/openapi.json"] }
 * ```
 */
export function studioLaunch(
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): StudioLaunch {
  if (platform !== "win32") {
    return { shellPath: "/bin/sh", shellArgs: ["-c", POSIX_SCRIPT, "courier-studio", ...args] };
  }
  const line = ["npx", "@noverax/courier-studio", ...args.map(cmdWord)].join(" ");
  /* Delayed expansion off, whatever the registry says: on, cmd would read a `!NAME!` once its ^ is gone. */
  return { shellPath: "cmd.exe", shellArgs: `/d /v:off /s /k "${line}"` };
}

/**
 * Run one of Courier Studio's commands for a project in a terminal of its
 * own, as {@link studioLaunch} starts it, where it shows its plan and asks
 * before it writes. The terminal is not brought back once the editor
 * restarts, which would run the command again.
 *
 * @param project - The project, whose folder the command runs in
 * @param title - The terminal's name
 * @param args - The command and its arguments: `["import", spec]`
 * @example
 * ```ts
 * runStudioCommand(project, "Import API", ["import", "https://api.example/openapi.json"]);
 * ```
 */
export function runStudioCommand(
  project: CourierProject,
  title: string,
  args: readonly string[],
): void {
  const terminal = vscode.window.createTerminal({
    name: `${title} · ${project.name}`,
    cwd: project.root,
    iconPath: new vscode.ThemeIcon("terminal"),
    isTransient: true,
    ...studioLaunch(args),
  });
  terminal.show();
}
