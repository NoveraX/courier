import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";

import type { LoadedCourierConfig } from "../../config-loader";
import { applyEdits } from "../../mocks-edit/plan/apply-edits";
import { parseSource } from "../../mocks-edit/plan/parse-source";
import { textDiffHunks } from "../../mocks-edit/text-diff-hunks";
import type { DiffHunk } from "../../mocks-edit/types";
import { formatProjectFiles } from "../../project-format/format-project-files";
import { sha256Hex } from "../../sha256-hex";
import type { AnswerObservations } from "../../storage/answer-observations";
import { contractReport, type EndpointContract } from "../contract-report";
import { responseOf } from "./endpoint-response";
import { planSchemaEdits } from "./plan-schema-edits";
import { sourceModules } from "./source-modules";

/** A file a schema fix changes: its text before and after, and the diff between. */
export interface FixedFile {
  readonly path: string;
  /** Its path from the project's root */
  readonly file: string;
  readonly before: string;
  readonly after: string;
  readonly hunks: DiffHunk[];
}

/** A difference a fix leaves as it is, and why. */
export interface LeftDifference {
  readonly path: string;
  readonly why: string;
}

/** A fix ready to apply, or why Studio writes none. */
export type SchemaFixPlan =
  | {
      readonly status: "ready";
      readonly files: readonly FixedFile[];
      readonly fixed: readonly string[];
      readonly left: readonly LeftDifference[];
      /** Names the files' texts before and after: an apply that finds another plan applies nothing */
      readonly digest: string;
    }
  | {
      readonly status: "manual";
      readonly reason: string;
      readonly left?: readonly LeftDifference[];
    };

/**
 * Plan the change that makes an endpoint's Zod response schema take the
 * answers Studio saw: where the schema is written, the edits to each file
 * the config loads, and the diff a person reviews. A file that follows the
 * project's formatter is formatted once changed; one that does not keeps
 * its layout, so the diff holds the fix alone.
 *
 * @param running - The config Studio runs
 * @param answers - The answers Studio saw
 * @param root - The project's root, links resolved
 * @param endpoint - The source and the endpoint's call
 * @returns The plan, or why there is none to apply
 * @example
 * ```ts
 * const plan = await planSchemaFix(running, answers, root, { source: "shop", endpoint: "products.get" });
 * ```
 */
export async function planSchemaFix(
  running: LoadedCourierConfig,
  answers: AnswerObservations,
  root: string,
  { source, endpoint }: { source: string; endpoint: string },
): Promise<SchemaFixPlan> {
  const name = `${source}.${endpoint}`;
  const contract = contractReport(running.config.sources, answers).find(
    (entry) => entry.source === source && entry.endpoint === endpoint,
  );
  const refusal = refusalOf(contract, name);
  if (refusal !== undefined || contract === undefined) return manual(refusal ?? "");
  const modules = sourceModules(root);
  const response = responseOf(modules, running.configFile, source, endpoint);
  if ("why" in response) return manual(`${response.why}, so Studio writes no change to it.`);
  const loaded = new Set(running.deps.flatMap(realPath));
  const plan = planSchemaEdits(modules, response, contract.drift, contract.calls, (path) =>
    loaded.has(path),
  );
  if (plan.files.size === 0) {
    return manual(`Studio could not place a change in ${name}'s schema.`, plan.left);
  }
  const files: FixedFile[] = [];
  for (const [path, edits] of plan.files) {
    const before = modules.module(path)?.text ?? "";
    /* Named as the project names it, with forward slashes on every system. */
    const file = relative(modules.root, path).split(sep).join("/");
    const changed = applyEdits(before, edits);
    const problem = parseSource(path, changed).problem;
    if (problem !== null)
      return manual(`The change to ${file} would not parse (${problem.message}).`);
    const after = await formattedLike(modules.root, file, before, changed);
    files.push({ path, file, before, after, hunks: textDiffHunks(before, after) });
  }
  return { status: "ready", files, fixed: plan.fixed, left: plan.left, digest: digestOf(files) };
}

function refusalOf(contract: EndpointContract | undefined, name: string): string | undefined {
  if (contract === undefined) return `Studio has no record of ${name}'s answers.`;
  if (contract.state !== "drifted")
    return `${name}'s answers fit its schema: there is nothing to change.`;
  if (contract.vendor !== "zod") {
    return `Studio writes the change for a Zod schema, and ${name}'s is written with ${contract.vendor}: copy the fields above into it.`;
  }
  return undefined;
}

/* Formatted only when the file follows the formatter already: otherwise its whole layout would change with the fix. */
async function formattedLike(
  root: string,
  file: string,
  before: string,
  after: string,
): Promise<string> {
  const [original] = (await formatProjectFiles(root, [{ path: file, content: before }])).files;
  if (original?.content !== before) return after;
  const [edited] = (await formatProjectFiles(root, [{ path: file, content: after }])).files;
  return edited?.content ?? after;
}

function digestOf(files: readonly FixedFile[]): string {
  return sha256Hex(
    JSON.stringify(files.map((f) => [f.file, sha256Hex(f.before), sha256Hex(f.after)])),
  );
}

/* The config's dependencies name absent paths too — where a module created would be imported — and those hold no schema. */
function realPath(path: string): string[] {
  try {
    return [realpathSync(path)];
  } catch {
    return [];
  }
}

function manual(reason: string, left?: readonly LeftDifference[]): SchemaFixPlan {
  return { status: "manual", reason, ...(left !== undefined && left.length > 0 && { left }) };
}
