import type { TerminalStyle } from "@noverax/courier/internal";

import type { FailureCode } from "../apply/setup-failure";
import type { SetupEnd } from "./setup-report";

/** What a run that stopped part way tells the person. */
export type FailedEnd = Extract<SetupEnd, { kind: "failed" }>;

/* What the person can do about each failure; nothing where they stopped it themselves or the run cannot tell. */
const WHAT_NOW: Readonly<Record<FailureCode, string | undefined>> = {
  INSTALL_FAILED: "Put right what stopped the install, and run the command again.",
  INSTALL_TIMED_OUT: "Run the command again once the registry answers in time.",
  CANCELLED: undefined,
  FILE_APPEARED: "Run the command again: it plans from the files as they are now.",
  FILE_CHANGED: "Run the command again: it plans from the files as they are now.",
  WRITE_FAILED:
    "Make room on the disk, or make the folder yours to write in, and run the command again.",
  PATH_OUTSIDE_PROJECT:
    "Put the file in place of the link, or move the link out of the way, and run the command again.",
  IMPORT_FAILED: "Check the specification and where it is, and run the command again.",
  GENERATOR_FAILED: "Put right what stopped it, then run the command again in an empty folder.",
  UNEXPECTED_ERROR: undefined,
};

/* What undoing the run did, in a sentence; it says the project is as it was only where everything was undone. */
function undoneLine(end: FailedEnd): string {
  const { removed, putBack, kept } = end.undone;
  const parts = [
    ...(removed.length > 0 ? [`removed ${removed.join(", ")}`] : []),
    ...(putBack.length > 0 ? [`put back ${putBack.join(", ")}`] : []),
  ];
  if (parts.length === 0)
    return kept.length === 0
      ? "Nothing was changed: the project is as it was."
      : "Nothing was undone.";
  const whole = kept.length === 0 ? ", and the project is as it was" : "";
  return `Undone${whole}: ${parts.join("; ")}.`;
}

/**
 * The lines a run that stopped part way ends with: what stopped it — with
 * its stack where the run did not expect it — what was undone, each file
 * it could not put back and why, how to put node_modules back where an
 * install had begun, and what to do now.
 *
 * @param end - How the run ended
 * @param style - How the terminal is painted
 * @returns The lines
 * @example
 * ```ts
 * failureLines({ kind: "failed", code: "INSTALL_FAILED", said, undone }, style);
 * ```
 */
export function failureLines(end: FailedEnd, style: TerminalStyle): string[] {
  const stack =
    end.code === "UNEXPECTED_ERROR" && end.error?.stack !== undefined
      ? end.error.stack
          .split("\n")
          .slice(1)
          .map((line) => style.dim(line))
      : [];
  const kept = end.undone.kept.map(({ path, why }) => style.yellow(`  ${path}: ${why}`));
  const reinstall =
    end.reinstall === undefined
      ? []
      : [
          style.dim(
            `node_modules may hold packages the install added: ${end.reinstall} puts it back as the lockfile says.`,
          ),
        ];
  const now = WHAT_NOW[end.code];
  return [
    "",
    style.red(`${end.said}.`),
    ...stack,
    undoneLine(end),
    ...(kept.length > 0 ? ["Left as they are:", ...kept] : []),
    ...reinstall,
    ...(now === undefined ? [] : [now]),
  ];
}
