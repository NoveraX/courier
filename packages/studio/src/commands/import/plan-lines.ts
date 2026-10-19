import type { TerminalStyle } from "@noverax/courier/internal";

import type { ParsedSpec } from "../../apis";
import type { Confirmation, KeptReason } from "../../server/import-files/file-plan-types";
import type { PlanSummary } from "../../server/import-files/plan-summary";
import { terminalText } from "../terminal-text";

const FORMATS: Readonly<Record<ParsedSpec["format"], string>> = {
  openapi3: "OpenAPI 3",
  swagger2: "Swagger 2",
  postman: "Postman",
};

/** Why a file is left as it is, in words. */
export const KEPT: Readonly<Record<KeptReason, string>> = {
  "not-written-by-studio": "not written by Studio",
  link: "a symbolic link",
  "not-a-file": "not a file",
  unconfirmed: "not allowed",
  imported: "a file that stays imports it",
};

const WAITING: Readonly<Record<Confirmation["reason"], string>> = {
  edited: "you changed it",
  claimed: "Studio has no record of writing it",
  foreign: "Studio did not write it",
};

/**
 * A count with its noun, one or many: `1 file`, `3 files`.
 *
 * @param count - How many
 * @param one - The noun for one
 * @param many - The noun for any other count
 * @returns The count and its noun
 * @example
 * ```ts
 * counted(3, "file", "files"); // "3 files"
 * ```
 */
export function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The line that names what is imported: the import's name, where its
 * specification came from, and what the specification holds.
 *
 * @param name - The import's name
 * @param from - Where the specification came from, as the person gave it
 * @param spec - The specification
 * @param selected - The endpoints picked, by group, when not every one is
 * @returns The line, and one for each operation the import leaves out
 * @example
 * ```ts
 * specLines("petStore", "./openapi.json", spec, null);
 * // ["Import petStore from ./openapi.json: OpenAPI 3, 19 endpoints in 3 groups"]
 * ```
 */
export function specLines(
  name: string,
  from: string,
  spec: ParsedSpec,
  selected: Readonly<Record<string, readonly string[]>> | null | undefined,
): string[] {
  const endpoints = spec.groups.reduce((sum, group) => sum + group.endpoints.length, 0);
  const groups = spec.groups.filter((group) => group.name !== "").length;
  const holds = `${counted(endpoints, "endpoint", "endpoints")} in ${counted(groups, "group", "groups")}`;
  const picked = selected
    ? Object.values(selected).reduce((sum, names) => sum + names.length, 0)
    : null;
  /* The specification's text, a path or a reference, is shown as it is, never acted on. */
  return [
    `Import ${terminalText(name)} from ${terminalText(from)}: ${FORMATS[spec.format]}, ${holds}${picked === null ? "" : `, ${picked} of them picked`}`,
    ...spec.skipped.map(
      (op) => `  Left out: ${terminalText(`${op.method} ${op.path}, ${op.reason}`)}`,
    ),
  ];
}

function inside(dir: string, path: string): string {
  return path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : path;
}

function writeLine(
  dir: string,
  write: PlanSummary["writes"][number],
  style: TerminalStyle,
): string {
  const path = inside(dir, write.path);
  if (write.action === "create") return `  ${style.green("+")} ${path}`;
  if (write.action === "unchanged") return style.dim(`  = ${path}  unchanged`);
  const edited = write.was === "recorded-edited" || write.was === "claimed-edited";
  const note =
    write.action === "replace" ? "replaced" : edited ? "updated, your edits kept" : "updated";
  return `  ${style.yellow("~")} ${path}  ${style.dim(note)}`;
}

/**
 * What writing the import's files does, file by file: created, replaced,
 * merged with your edits, unchanged, removed or kept as it is — and the
 * steps that wait for your consent.
 *
 * @param plan - The plan
 * @param style - How the terminal is painted
 * @returns The lines
 * @example
 * ```ts
 * console.log(planLines(plan, styleFor(process.stdout)).join("\n"));
 * ```
 */
export function planLines(plan: PlanSummary, style: TerminalStyle): string[] {
  const tools = plan.formatting?.formattedWith ?? [];
  const formatted = tools.length > 0 ? `, formatted with ${tools.join(", ")}` : "";
  return [
    `Files in ${plan.dir}${formatted}:`,
    ...plan.writes.map((write) => writeLine(plan.dir, write, style)),
    ...plan.removals.map(
      ({ path }) =>
        `  ${style.red("-")} ${inside(plan.dir, path)}  ${style.dim("removed, a copy kept")}`,
    ),
    ...plan.kept.map(({ path, reason }) =>
      style.dim(`    ${inside(plan.dir, path)}  kept as it is: ${KEPT[reason]}`),
    ),
    ...(plan.formatting?.problem ? [style.yellow(`  ${plan.formatting.problem}`)] : []),
    ...(plan.pending.length > 0 ? ["Waiting for your consent:"] : []),
    ...plan.pending.map((step) => `  ${step.kind} ${step.path}: ${WAITING[step.reason]}`),
  ];
}
