import { useEffect, useState } from "react";

import { post } from "@/lib/api-client";
import {
  type SchemaFixPreview,
  type SchemaFixTarget,
  schemaFixPreviewOf,
} from "./schema-fix-preview";

/** Where showing a schema fix stands. */
export type FixPreviewState =
  | { kind: "loading" }
  | { kind: "shown"; preview: SchemaFixPreview }
  | { kind: "failed"; message: string };

/**
 * The change Studio plans for an endpoint's schema, asked again whenever
 * the endpoint or the attempt changes — after an apply that found the
 * files or the answers changed since.
 *
 * @param target - The endpoint, or `null` while none is shown
 * @param attempt - Counts the times it was asked again
 * @returns Where the preview stands
 * @example
 * ```ts
 * const state = useSchemaFixPreview(target, attempt);
 * ```
 */
export function useSchemaFixPreview(
  target: SchemaFixTarget | null,
  attempt: number,
): FixPreviewState {
  const [state, setState] = useState<FixPreviewState>({ kind: "loading" });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` changes only to ask for the change once more
  useEffect(() => {
    if (target === null) return;
    let current = true;
    setState({ kind: "loading" });
    post<unknown>("/api/contract/fix/preview", target).then(
      (answer) => {
        if (!current) return;
        const preview = schemaFixPreviewOf(answer);
        setState(
          preview === undefined
            ? { kind: "failed", message: "Studio answered with a change it could not show." }
            : { kind: "shown", preview },
        );
      },
      (error: unknown) => {
        if (current)
          setState({
            kind: "failed",
            message: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      current = false;
    };
  }, [target, attempt]);
  return state;
}
