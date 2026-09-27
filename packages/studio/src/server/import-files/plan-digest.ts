import { createHash } from "node:crypto";
import { bodyHash } from "./body-hash";
import type { FilePlan } from "./file-plan-types";

/**
 * Hash a plan before any confirmation is applied: every write with the hash
 * of what it writes and of what it replaces, every removal and step waiting
 * for consent, every file kept or blocked. A preview's digest equals the
 * apply's only if nothing in the plan, nor anything on disk it rests on,
 * changed between them.
 *
 * @param plan - The plan, without its digest
 * @returns 64 hex characters
 * @example
 * ```ts
 * const plan = { ...parts, digest: planDigest(parts) };
 * ```
 */
export function planDigest(plan: Omit<FilePlan, "digest">): string {
  const canonical = JSON.stringify([
    plan.importName,
    plan.dir,
    plan.writes.map((w) => [w.path, w.action, bodyHash(w.body), w.priorSha256 ?? null]),
    plan.removals.map((r) => [r.path, r.priorSha256]),
    plan.pending.map((p) => [
      p.confirmation.path,
      p.confirmation.kind,
      p.confirmation.reason,
      p.write ? bodyHash(p.write.body) : null,
      p.write?.priorSha256 ?? p.removal?.priorSha256 ?? null,
    ]),
    plan.kept.map((k) => [k.path, k.reason]),
    plan.blocked.map((b) => [b.path, b.reason]),
    [...plan.forgotten].sort(),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
