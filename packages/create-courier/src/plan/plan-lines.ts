import type { TerminalStyle } from "@noverax/courier/internal";

import { changedLines } from "../edit/line-diff";
import type { ManualStep, NextStep } from "../recipes/recipe-types";
import type { Plan, PlannedEdit, PlannedFile } from "./build-plan";

function fileLine(file: PlannedFile, width: number, style: TerminalStyle): string {
  const path = file.path.padEnd(width);
  if (file.state === "create") return `  ${style.green("+")} ${path}  ${style.dim(file.purpose)}`;
  if (file.state === "same") return style.dim(`  = ${path}  already there`);
  return `  ${style.yellow("!")} ${path}  ${style.dim("a file of yours is here: kept, see below")}`;
}

function packageLines(plan: Plan, style: TerminalStyle): string[] {
  const { dependencies, devDependencies, typescript } = plan;
  if (dependencies.length === 0 && devDependencies.length === 0 && typescript === undefined)
    return [];
  return [
    "Packages",
    ...(dependencies.length > 0 ? [`  ${style.green("+")} ${dependencies.join(" ")}`] : []),
    ...(devDependencies.length > 0
      ? [`  ${style.green("+")} ${devDependencies.join(" ")}  ${style.dim("(dev)")}`]
      : []),
    ...(typescript ? [typescriptLine(typescript, style)] : []),
    "",
  ];
}

function typescriptLine(typescript: NonNullable<Plan["typescript"]>, style: TerminalStyle): string {
  if (typescript.from === undefined) {
    return `  ${style.green("+")} ${typescript.to}  ${style.dim("(dev) Courier's types are checked with TypeScript 6.0 or later, and so are the files it adds")}`;
  }
  return `  ${style.yellow("~")} ${typescript.to}  ${style.dim(`(dev) Courier's types are checked with TypeScript 6.0 or later; the new project came with ${typescript.from}`)}`;
}

/* An edit as the plan shows it: the file, what for, and the lines it removes and adds. */
function editLines(edit: PlannedEdit, width: number, style: TerminalStyle): string[] {
  const path = edit.path.padEnd(width);
  if (edit.state === "same") return [style.dim(`  = ${path}  holds this already`)];
  return [
    `  ${style.yellow("~")} ${path}  ${style.dim(edit.purpose)}`,
    ...changedLines(edit.before, edit.after).map((line) =>
      line.sign === "+" ? style.green(`      + ${line.text}`) : style.red(`      - ${line.text}`),
    ),
  ];
}

/**
 * A step left to the person, as the plan and the summary show it: the
 * file, what to do, and the lines to add.
 *
 * @param step - The step
 * @param style - How the terminal is painted
 * @returns The lines
 * @example
 * ```ts
 * manualLines({ file: "next.config.ts", what: "Wrap the config", lines: ["…"] }, style);
 * ```
 */
export function manualLines(step: ManualStep, style: TerminalStyle): string[] {
  return [
    `  ${style.bold(step.file)}: ${step.what}`,
    ...step.lines.map((line) => style.dim(`      ${line}`)),
  ];
}

/**
 * What to run once Courier is set up, the commands in a column of their
 * own; a note where there is no command.
 *
 * @param steps - The steps
 * @param style - How the terminal is painted
 * @returns The lines
 * @example
 * ```ts
 * nextLines([{ command: "npm run dev", what: "starts the app" }], style); // ["  npm run dev  starts the app"]
 * ```
 */
export function nextLines(steps: readonly NextStep[], style: TerminalStyle): string[] {
  const width = Math.max(0, ...steps.map((step) => step.command.length));
  return steps.map((step) =>
    step.command === ""
      ? `  ${step.what}`
      : `  ${style.bold(step.command.padEnd(width))}  ${step.what}`,
  );
}

/**
 * What setting Courier up does, for the person to read before it happens:
 * the files it adds — and those already there or of the project's own —
 * the lines it changes in files of the project's — its package.json's
 * scripts among them — the packages it installs, and the steps left to
 * them.
 *
 * @param title - The plan's first line: the project, its framework and package manager
 * @param plan - The plan
 * @param style - How the terminal is painted
 * @returns The lines
 * @example
 * ```ts
 * console.log(planLines("Set Courier up in shop (Next.js 16.4.0, npm)", plan, style).join("\n"));
 * ```
 */
export function planLines(title: string, plan: Plan, style: TerminalStyle): string[] {
  const width = Math.max(...[...plan.files, ...plan.edits].map((file) => file.path.length));
  return [
    style.bold(title),
    "",
    "Files",
    ...plan.files.map((file) => fileLine(file, width, style)),
    "",
    ...(plan.edits.length > 0
      ? [
          "Changes to your files",
          ...plan.edits.flatMap((edit) => editLines(edit, width, style)),
          "",
        ]
      : []),
    ...packageLines(plan, style),
    ...(plan.manual.length > 0
      ? ["Left to you", ...plan.manual.flatMap((step) => manualLines(step, style)), ""]
      : []),
  ];
}
