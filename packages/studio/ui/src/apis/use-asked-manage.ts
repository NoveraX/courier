import { useEffect } from "react";
import { useManageRequest } from "@/features/apis/manage-request";
import type { SourceSummary } from "@/features/apis/types";
import type { PickedEndpoint } from "./use-manage";

/**
 * Open the manage dialog on the import another page asked for — once the
 * page has listed it — with the endpoint it picked, and take the ask.
 *
 * @param start - What opens the manage dialog
 * @param imports - The imports the page lists
 * @example
 * ```ts
 * useAskedManage(manageFlow.start, imported.flatMap((source) => source.registry ?? []));
 * ```
 */
export function useAskedManage(
  start: (source: SourceSummary, spec: undefined, picked: PickedEndpoint) => void,
  imports: readonly SourceSummary[],
): void {
  const request = useManageRequest((s) => s.request);
  useEffect(() => {
    if (!request) return;
    const summary = imports.find((one) => one.name === request.source);
    if (!summary) return;
    useManageRequest.setState({ request: null });
    start(summary, undefined, request.picked);
  }, [request, imports, start]);
}
