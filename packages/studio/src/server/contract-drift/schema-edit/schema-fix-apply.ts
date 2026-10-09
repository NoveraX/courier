import { createLogger } from "@noverax/courier";

import { describeError } from "../../describe-error";
import type { ExclusiveContext } from "../../exclusive-context";
import { sha256Hex } from "../../sha256-hex";
import type { AnswerObservations } from "../../storage/answer-observations";
import { contractReport } from "../contract-report";
import { replaceSourceFile } from "./replace-source-file";
import {
  type FixedFile,
  type LeftDifference,
  planSchemaFix,
  type SchemaFixPlan,
} from "./schema-fix-plan";

const log = createLogger("Studio");

/** A fix Studio applied, kept so it can be taken back. */
export interface AppliedFix {
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly file: string;
    readonly before: string;
    readonly afterHash: string;
  }>;
}

/** What applying a fix came to. */
export type SchemaFixOutcome =
  | {
      readonly status: "applied";
      readonly files: readonly string[];
      readonly fixed: readonly string[];
      readonly left: readonly LeftDifference[];
    }
  | { readonly status: "stale"; readonly preview: SchemaFixPlan }
  | { readonly status: "manual"; readonly reason: string };

/** What applying a fix reads and keeps. */
export interface SchemaFixDeps {
  readonly answers: AnswerObservations;
  readonly root: string;
  /** The fixes applied, by endpoint, each until it is undone or replaced */
  readonly applied: Map<string, AppliedFix>;
}

/**
 * Apply the fix a person reviewed: plan it again, and write it only when
 * it is the one they saw; then load the config as it is on disk and run
 * it. A config that does not load, or a change that left every difference
 * it was to fix — it did not reach the endpoint's schema — is put back.
 *
 * @param tx - The edit's hold on the reload chain
 * @param deps - The answers, the project's root and the fixes applied
 * @param request - The endpoint, and the digest of the plan reviewed
 * @returns What it came to
 * @example
 * ```ts
 * await runConfigEdit(project, (tx) => applySchemaFix(tx, deps, { source, endpoint, digest }));
 * ```
 */
export async function applySchemaFix(
  tx: ExclusiveContext,
  deps: SchemaFixDeps,
  request: { source: string; endpoint: string; digest: string },
): Promise<SchemaFixOutcome> {
  const running = tx.current();
  if (running === null)
    return { status: "manual", reason: "Studio runs no config now, so it changed nothing." };
  const plan = await planSchemaFix(running, deps.answers, deps.root, request);
  if (plan.status === "manual") return plan;
  if (plan.digest !== request.digest) return { status: "stale", preview: plan };
  const written = writeAll(plan.files);
  if (written === "stale") return { status: "stale", preview: plan };
  tx.acknowledge(plan.files.map((file) => file.path));
  const name = `${request.source}.${request.endpoint}`;
  let still: readonly string[];
  try {
    const loaded = await tx.load();
    tx.apply(loaded);
    if (tx.current() !== loaded)
      throw new Error("Studio could not run the config it loaded; the terminal says why");
    const after = contractReport(loaded.config.sources, deps.answers).find(
      (entry) => entry.source === request.source && entry.endpoint === request.endpoint,
    );
    const drifting = new Set(after?.drift.map((difference) => difference.path) ?? []);
    still = plan.fixed.filter((path) => drifting.has(path));
  } catch (error) {
    await putBack(tx, plan.files);
    return {
      status: "manual",
      reason: `The config did not load once ${name}'s schema changed (${describeError(error, deps.root)}), so Studio put the files back.`,
    };
  }
  if (still.length === plan.fixed.length) {
    await putBack(tx, plan.files);
    return {
      status: "manual",
      reason: `The change did not reach ${name}'s schema, so Studio put the files back.`,
    };
  }
  deps.applied.set(name, {
    files: plan.files.map(({ path, file, before, after }) => ({
      path,
      file,
      before,
      afterHash: sha256Hex(after),
    })),
  });
  log.info(`Studio changed ${name}'s schema in ${plan.files.map((file) => file.file).join(", ")}`);
  return {
    status: "applied",
    files: plan.files.map((file) => file.file),
    fixed: plan.fixed.filter((path) => !still.includes(path)),
    left: [...plan.left, ...still.map((path) => ({ path, why: "it still differs once changed" }))],
  };
}

/* Each file written in turn; one that changed since it was read stops the rest, and those written are put back. */
function writeAll(files: readonly FixedFile[]): "written" | "stale" {
  const done: FixedFile[] = [];
  for (const file of files) {
    if (!replaceSourceFile(file.path, file.after, sha256Hex(file.before))) {
      for (const back of done) replaceSourceFile(back.path, back.before, sha256Hex(back.after));
      return "stale";
    }
    done.push(file);
  }
  return "written";
}

/**
 * Write the files back as they were and run the config again. A file
 * changed since it was written stays as it is, and the reload chain is
 * told to read it.
 *
 * @param tx - The edit's hold on the reload chain
 * @param files - Each file, with its text before and after
 * @example
 * ```ts
 * await putBack(tx, plan.files);
 * ```
 */
export async function putBack(
  tx: ExclusiveContext,
  files: ReadonlyArray<{ path: string; before: string; afterHash?: string; after?: string }>,
): Promise<void> {
  const written: string[] = [];
  const changed: string[] = [];
  for (const file of files) {
    const expected = file.afterHash ?? sha256Hex(file.after ?? "");
    if (replaceSourceFile(file.path, file.before, expected)) written.push(file.path);
    else {
      log.warn(`${file.path} changed after Studio wrote it; it stays as it is`);
      changed.push(file.path);
    }
  }
  /* Only what Studio wrote is taken as seen: a person's own change still reloads. */
  tx.acknowledge(written);
  if (changed.length > 0) tx.reloadAfter(changed);
  try {
    tx.apply(await tx.load());
  } catch (error) {
    log.warn(
      "The config did not load once Studio put its files back; it reloads when they change",
      error,
    );
    tx.reloadAfter(written);
  }
}
