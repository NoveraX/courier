import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { styleFor, type TerminalStyle } from "@noverax/courier/internal";

import { MINIMAL_CONFIG } from "@/features/apis/minimal-config";
import type { ConfigEditDeps } from "../../server/config-edit/declare-alone";
import { listed } from "../../server/config-edit/file-changes";
import { withImportsLock } from "../../server/imports-lock";
import { loadProjectEnv } from "../../server/project-env";
import { closeFormatProcesses } from "../../server/project-format/formatter-host";
import type { ConfigFailure } from "../../server/project-state/types";
import { type ImportWritePlan, planImportWrite, writeImport } from "../../server/write-import";
import type { ImportDeclaration, WriteBody } from "../../server/write-types";
import { askYesNo, consentTo } from "./consent";
import { declarationFiles } from "./declaration-files";
import { declarationLines } from "./declaration-lines";
import { declareImport } from "./declare-import";
import { type ImportRun, importRequest } from "./import-request";
import { loadProjectOnce } from "./load-project-once";
import { planLines, specLines } from "./plan-lines";
import { readSpecInput } from "./read-spec-input";
import { routesLines } from "./routes-lines";
import { usageLines, writtenLines } from "./written-lines";

const NOT_ASKED =
  "Nothing was written: run it again with --yes to write it, or --dry-run to only show it.";

const print = (lines: readonly string[]) => process.stdout.write(`${lines.join("\n")}\n`);

function refuseConfig(failure: ConfigFailure | null, root: string): number {
  if (failure?.code !== "CONFIG_NOT_FOUND")
    throw new Error(failure?.message ?? "courier.config did not load");
  print([
    `There is no courier.config.ts in ${root}. Create it, with @noverax/courier installed, and import again:`,
    "",
    MINIMAL_CONFIG,
  ]);
  return 1;
}

function planShown(
  from: string,
  body: WriteBody,
  planned: ImportWritePlan,
  style: TerminalStyle,
): string[] {
  const declaration = planned.declaration;
  return [
    ...specLines(body.sourceName, from, body.spec, body.options.selectedEndpoints),
    "",
    ...planLines(planned.plan, style),
    ...(declaration ? ["", thenDeclared(declaration), ...declarationLines(declaration)] : []),
  ];
}

function thenDeclared(declaration: ImportDeclaration): string {
  const files = declarationFiles(declaration);
  return `Then ${listed(files)} ${files.length > 1 ? "declare" : "declares"} it:`;
}

async function written(
  body: WriteBody,
  planned: ImportWritePlan,
  run: ImportRun,
  deps: ConfigEditDeps,
  interactive: boolean,
): Promise<string[] | null> {
  const confirm = (run.confirm ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  const question = planned.declaration
    ? `Write these files and declare ${body.sourceName}?`
    : "Write these files?";
  const answer = await consentTo(planned.plan, {
    yes: run.yes === true,
    confirm,
    interactive,
    question,
    ask: askYesNo,
  });
  if (answer === null) return null;
  const consented = { ...body, planDigest: planned.plan.digest, confirm: answer.confirm };
  return writtenLines(await withImportsLock(() => writeImport(consented, deps)), planned.plan.dir);
}

async function importInto(
  root: string,
  given: string,
  run: ImportRun,
  style: TerminalStyle,
): Promise<number> {
  const project = await loadProjectOnce(root);
  const { failure, running } = project.snapshot();
  if (failure || running === null) return refuseConfig(failure, root);
  const input = await readSpecInput(given, project, root);
  const body = importRequest(input, run, running.config);
  const deps = { project, projectRoot: root };
  const found = await withImportsLock(() => planImportWrite(body, deps));
  const planned = run.declare === false ? { ...found, declaration: undefined } : found;
  print(planShown(given === "-" ? "standard input" : given, body, planned, style));
  if (run["dry-run"] === true) return 0;
  const interactive =
    given !== "-" && process.stdin.isTTY === true && process.stderr.isTTY === true;
  const lines = await written(body, planned, run, deps, interactive);
  if (lines === null) {
    print([interactive ? "Nothing was written." : NOT_ASKED]);
    return 1;
  }
  print(["", ...lines]);
  if (planned.declaration === undefined) return finish(found, run, body);
  const declared = await declareImport(body, deps, style);
  print([...declared.lines, ...(await routesLines(root, project)), ...usageLines(body)]);
  return declared.status;
}

function finish(found: ImportWritePlan, run: ImportRun, body: WriteBody): number {
  const left = run.declare === false ? found.declaration : undefined;
  print([
    ...(left
      ? [`Add these lines to ${listed(declarationFiles(left))}:`, ...declarationLines(left)]
      : []),
    ...usageLines(body),
  ]);
  return 0;
}

/**
 * Import an OpenAPI 3, Swagger 2 or Postman specification into the project
 * from the command line, as Studio's Import API does from its page: the
 * same code, written into the same folder and recorded the same way, the
 * plan shown first and applied as the person allows it, and the import
 * then declared in `courier.config.ts`.
 *
 * @param given - The specification: a URL, a file, or `-` for standard input
 * @param run - The options typed
 * @returns The exit status: `0` once written and declared, or shown with `--dry-run`
 * @example
 * ```ts
 * process.exitCode = await runImport("https://petstore3.swagger.io/api/v3/openapi.json", { yes: true });
 * ```
 */
export async function runImport(given: string, run: ImportRun): Promise<number> {
  const asked = resolve(run.cwd ?? process.cwd());
  if (!existsSync(asked)) throw new Error(`There is no folder at ${asked}`);
  const root = realpathSync(asked);
  loadProjectEnv(root, run.dotenv);
  /* The command says what it did itself; Studio's own info lines would say it twice. */
  const level = process.env.COURIER_LOG_LEVEL;
  process.env.COURIER_LOG_LEVEL = level ?? "warn";
  try {
    return await importInto(root, given, run, styleFor(process.stdout));
  } finally {
    if (level === undefined) Reflect.deleteProperty(process.env, "COURIER_LOG_LEVEL");
    await closeFormatProcesses(root);
  }
}
