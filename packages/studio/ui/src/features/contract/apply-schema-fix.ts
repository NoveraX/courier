import { toast } from "sonner";

import { post } from "@/lib/api-client";
import { isPlainObject } from "@/socket/is-plain-object";
import { refreshContract } from "./contract-store";
import type { SchemaFixTarget } from "./schema-fix-preview";

/** How applying a schema fix went. */
export type ApplyOutcome = "applied" | "changed" | "failed";

/**
 * Apply the change a person reviewed to an endpoint's schema. Studio
 * writes it only when it is still the one shown, runs the config again,
 * and puts the files back when the config does not load; the toast that
 * says it was written carries Undo.
 *
 * @param target - The endpoint
 * @param digest - Names the change shown
 * @returns How it went: `changed` when the files or the answers changed since it was shown
 * @example
 * ```ts
 * if ((await applySchemaFix(target, preview.digest)) === "changed") setAttempt((n) => n + 1);
 * ```
 */
export async function applySchemaFix(
  target: SchemaFixTarget,
  digest: string,
): Promise<ApplyOutcome> {
  const name = `${target.source}.${target.endpoint}`;
  try {
    const answer = await post<unknown>("/api/contract/fix/apply", { ...target, digest });
    if (!isPlainObject(answer)) throw new Error("Studio did not say how it went.");
    if (answer.status === "stale") {
      toast.info("The files or the answers changed since the change was shown: review it again.");
      return "changed";
    }
    if (answer.status !== "applied")
      throw new Error(String(answer.reason ?? "Studio changed nothing."));
    const files = Array.isArray(answer.files) ? answer.files.join(", ") : "its file";
    toast.success(`Changed ${name}'s schema in ${files}`, {
      action: { label: "Undo", onClick: () => void undoSchemaFix(target) },
    });
    await refreshContract();
    return "applied";
  } catch (error) {
    toast.error(`Could not change ${name}'s schema: ${messageOf(error)}`);
    return "failed";
  }
}

/**
 * Take back the last change Studio made to an endpoint's schema, while
 * its files still hold what Studio wrote.
 *
 * @param target - The endpoint
 * @example
 * ```ts
 * await undoSchemaFix({ source: "shop", endpoint: "products.get" });
 * ```
 */
export async function undoSchemaFix(target: SchemaFixTarget): Promise<void> {
  const name = `${target.source}.${target.endpoint}`;
  try {
    const answer = await post<unknown>("/api/contract/fix/undo", target);
    if (!isPlainObject(answer) || answer.status !== "undone") {
      throw new Error(
        isPlainObject(answer) ? String(answer.reason ?? "") : "Studio did not say how it went.",
      );
    }
    const files = Array.isArray(answer.files) ? answer.files.join(", ") : "its file";
    toast.success(`Put ${files} back as it was before ${name}'s schema changed`);
    await refreshContract();
  } catch (error) {
    toast.error(`Could not take the change back: ${messageOf(error)}`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
