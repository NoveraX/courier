/**
 * Reads the catalog scan data from the studio store and turns it into the
 * endpoint-selection map consumed by the mock wizard preview step.
 *
 * Called once per "Generate Preview" click — the result feeds the wizard
 * preview step.
 */

import { useStudioStore } from "@/store";

import type { EndpointSelection } from "./types";
import { inferHttpMethod } from "./infer-http-method";

interface BuildResult {
  endpoints: Record<string, Record<string, EndpointSelection[]>>;
  sourceFilePaths: Record<string, string>;
}

/**
 * Build the endpoint selection map and source file path lookup for the
 * given selected source names. All endpoints start `selected: true`.
 */
export function buildEndpointSelections(selectedSources: string[]): BuildResult {
  const { scanSources } = useStudioStore.getState();

  const sourceFilePaths: Record<string, string> = {};
  for (const scanned of scanSources) {
    if (selectedSources.includes(scanned.name)) {
      sourceFilePaths[scanned.name] = scanned.filePath;
    }
  }

  const endpoints: Record<string, Record<string, EndpointSelection[]>> = {};

  for (const sourceName of selectedSources) {
    const scanned = scanSources.find((s) => s.name === sourceName);
    if (!scanned) continue;

    endpoints[sourceName] = {};
    const described = (groupName: string, list: typeof scanned.groups[number]["endpoints"]) =>
      list.map((ep) => ({
        group: groupName,
        endpoint: ep.name,
        httpMethod:
          ep.analysis.httpMethod ??
          inferHttpMethod(ep.name, ep.analysis.type ?? undefined, ep.analysis.path),
        path: ep.analysis.path ?? "",
        selected: true,
      }));

    for (const group of scanned.groups) {
      endpoints[sourceName][group.name] = described(group.name, group.endpoints);
    }
    /* Ungrouped endpoints are addressed with no group name, the same way the
       proxy addresses them. */
    if (scanned.inlineEndpoints?.length) {
      endpoints[sourceName][""] = described("", scanned.inlineEndpoints);
    }
  }

  return { endpoints, sourceFilePaths };
}
