import type { TerminalStyle } from "@noverax/courier/internal";

import type { TypecheckOutcome } from "../apply/typecheck";
import { changesAnything, type Plan } from "../plan/build-plan";
import { manualLines, nextLines, planLines } from "../plan/plan-lines";
import type { GitState } from "../preflight/git-state";
import type { ConfiguredSources } from "../project/configured-sources";
import { failureLines } from "./failure-lines";
import type { SetupEnd, SetupReport } from "./setup-report";
import { upgradeLines } from "./upgrade-lines";

/* What the config declares, and what the plan does about it. */
function configuredLine(configured: ConfiguredSources, changes: boolean): string {
  const { names, more, path } = configured;
  const count = more ? "its APIs" : `${names.length} ${names.length === 1 ? "API" : "APIs"}`;
  const named = names.length > 0 ? ` (${names.join(", ")}${more ? ", and more" : ""})` : "";
  const then = changes ? " The plan adds no example, only what the project lacks." : "";
  return `Courier is set up here already: ${path} declares ${count}${named}.${then}`;
}

/* What git says of the project, under the plan: changes of the person's not committed, or that nothing was checked. */
function gitLines(git: GitState | undefined, style: TerminalStyle): string[] {
  if (git === undefined || git.kind === "clean") return [];
  if (git.kind === "unknown") return [style.dim(`Not checked against git: ${git.why}.`), ""];
  const more = git.count > git.paths.length ? `, and ${git.count - git.paths.length} more` : "";
  const changes = `${git.count} ${git.count === 1 ? "change" : "changes"}`;
  return [
    style.yellow(
      `! git has ${changes} here not committed: ${git.paths.join(", ")}${more}. Commit them first, and git shows the setup's changes apart from yours.`,
    ),
    "",
  ];
}

/* What is left to the person, and what to run next. */
function closingLines(plan: Plan, style: TerminalStyle): string[] {
  return [
    ...(plan.manual.length > 0
      ? ["", "Left to you", ...plan.manual.flatMap((step) => manualLines(step, style))]
      : []),
    "",
    "Next",
    ...nextLines(plan.next, style),
  ];
}

function typecheckLines(outcome: TypecheckOutcome, style: TerminalStyle): string[] {
  switch (outcome.kind) {
    case "clean":
      return ["", "The files Courier added type-check against the project's tsconfig."];
    case "no-typescript":
      return [
        "",
        style.yellow(
          "TypeScript is not installed in the project, so the files Courier added were not type-checked.",
        ),
      ];
    case "unchecked":
      return ["", style.yellow(`TypeScript could not check the project: ${outcome.reason}`)];
    case "errors":
      return ["", style.red("TypeScript finds errors in what Courier added:"), ...outcome.lines];
  }
}

function endLines(end: SetupEnd, style: TerminalStyle): string[] {
  switch (end.kind) {
    case "unchanged":
      return [
        end.said,
        ...(end.next.length > 0 ? ["", "Next", ...nextLines(end.next, style)] : []),
      ];
    case "refused":
      return [end.said];
    case "install-left":
      return [
        "",
        "Install the packages to finish:",
        ...end.commands.map((command) => `  ${command.join(" ")}`),
        ...closingLines(end.plan, style),
      ];
    case "applied":
      return ["", style.green(end.said), ...closingLines(end.plan, style)];
    case "failed":
      return failureLines(end, style);
    case "dry-run":
    case "typecheck-failed":
      return [];
  }
}

/**
 * A run told to a person at a terminal, as it goes: the plan, each step as
 * it is done, and what is left to them and what to run next.
 *
 * @param style - How the terminal is painted
 * @param print - Writes lines to the terminal
 * @returns The report
 * @example
 * ```ts
 * const report = textReport(styleFor(process.stdout), (lines) => process.stdout.write(`${lines.join("\n")}\n`));
 * ```
 */
export function textReport(
  style: TerminalStyle,
  print: (lines: readonly string[]) => void,
): SetupReport {
  /* A plan shown after a new project was made stands apart from what making it printed. */
  let madeProject = false;
  return {
    newProject({ name, framework, how }) {
      madeProject = true;
      print([
        style.bold(`Create ${name} with ${framework}, then set Courier up in it`),
        "",
        `  ${how}`,
        "",
      ]);
    },
    note: (lines) => print(["", ...lines]),
    plan({ title, plan, configured, git, upgrade }) {
      const lead = [
        ...(configured ? [configuredLine(configured, changesAnything(plan))] : []),
        ...(upgrade ? upgradeLines(upgrade, style) : []),
      ];
      const lines = [...planLines(title, plan, style, lead), ...gitLines(git, style)];
      print([...(madeProject ? [""] : []), ...lines]);
    },
    /* The person watched the install as it ran. */
    installed: () => undefined,
    wrote({ written, changed }) {
      const files = `${written.length} ${written.length === 1 ? "file" : "files"}`;
      const changes = changed.length > 0 ? `, and changed ${changed.join(", ")}` : "";
      print(["", `Wrote ${files}${changes}.`]);
    },
    prepareFailed(said, lines) {
      const shown = lines
        .filter((line) => line.trim() !== "")
        .map((line) => style.dim(`  ${line}`));
      print([style.yellow(said), ...shown]);
    },
    typechecked: (outcome) => print(typecheckLines(outcome, style)),
    end(end) {
      const lines = endLines(end, style);
      if (lines.length > 0) print(lines);
    },
  };
}
