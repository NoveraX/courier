import { bodyHash } from "../import-files/body-hash";
import type {
  FilePlan,
  PendingStep,
  PlanFormatting,
  PlannedWrite,
} from "../import-files/file-plan-types";
import { planDigest } from "../import-files/plan-digest";
import type { ProjectFormatters } from "./find-formatters";
import { formatProjectFiles } from "./format-project-files";

/**
 * Format the files a plan merges as the project formats its code: a merged
 * file holds the user's code and the pieces Studio put into it, so it is
 * formatted whole, as a whole file the user saves would be. A file the
 * formatting leaves as it is on disk is no longer a write. The plan's
 * digest is taken again, so a request quoting the plan quotes it as shown,
 * and the plan says how its files were formatted.
 *
 * @param root - The project root, symlinks resolved
 * @param plan - The plan, its generated files formatted already
 * @param formatters - The project's formatters
 * @param earlier - How the generated files were formatted, before the plan was made of them
 * @returns The plan with its merged files formatted
 * @example
 * ```ts
 * const plan = await formatPlannedWrites(root.path, planFiles(root, request, recorded), formatters, generated);
 * ```
 */
export async function formatPlannedWrites(
  root: string,
  plan: FilePlan,
  formatters: ProjectFormatters,
  earlier: PlanFormatting | null = null,
): Promise<FilePlan> {
  const merged = [
    ...plan.writes,
    ...plan.pending.flatMap((step) => (step.write ? [step.write] : [])),
  ]
    .filter((write) => write.action === "merge")
    .map((write) => ({ path: write.path, content: write.body }));
  const { files, formattedWith, problem } = await formatProjectFiles(root, merged, formatters);
  const formatted = new Map(files.map((file) => [file.path, file.content]));
  const settle = (write: PlannedWrite): PlannedWrite => {
    const body = formatted.get(write.path);
    if (body === undefined || body === write.body) return write;
    const unchanged = write.was !== "foreign" && bodyHash(body) === write.priorSha256;
    return { ...write, body, action: unchanged ? "unchanged" : write.action };
  };
  const writes = plan.writes.map(settle);
  const pending: PendingStep[] = [];
  for (const step of plan.pending) {
    const write = step.write && settle(step.write);
    /* Formatted to what is on disk, a merge changes nothing and asks nothing. */
    if (write?.action === "unchanged") writes.push(write);
    else pending.push(write ? { ...step, write } : step);
  }
  const { digest: _shown, ...unsigned } = plan;
  const rest: Omit<FilePlan, "digest"> = { ...unsigned, writes, pending };
  const formatting = { formattedWith, problem: earlier?.problem ?? problem };
  return { ...rest, digest: planDigest(rest), formatting };
}
