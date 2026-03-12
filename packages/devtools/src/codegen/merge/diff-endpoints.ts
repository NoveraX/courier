/**
 * Endpoint-level diffing between two parsed specs.
 * Accepts both ParsedGroup[] and DigestGroup[] (structurally compatible).
 */

import type { DiffEndpoint, DigestEndpoint, DigestGroup } from "./types";

export interface EndpointDiffResult {
  added: DiffEndpoint[];
  removed: DiffEndpoint[];
  modified: DiffEndpoint[];
}

function endpointKey(group: string, ep: DigestEndpoint): string {
  return `${group}.${ep.name}`;
}

function toDiffEndpoint(group: string, ep: DigestEndpoint): DiffEndpoint {
  return { group, name: ep.name, method: ep.httpMethod, path: ep.path };
}

function buildEndpointMap(
  groups: DigestGroup[],
): Map<string, { group: string; endpoint: DigestEndpoint }> {
  const map = new Map<string, { group: string; endpoint: DigestEndpoint }>();
  for (const group of groups) {
    for (const ep of group.endpoints) {
      map.set(endpointKey(group.name, ep), { group: group.name, endpoint: ep });
    }
  }
  return map;
}

function compareParams(oldEp: DigestEndpoint, newEp: DigestEndpoint): string[] {
  const changes: string[] = [];
  const oldParams = new Set(oldEp.parameters.map((p) => `${p.in}:${p.name}`));
  const newParams = new Set(newEp.parameters.map((p) => `${p.in}:${p.name}`));
  for (const p of newParams) {
    if (!oldParams.has(p)) changes.push(`parameter added: ${p}`);
  }
  for (const p of oldParams) {
    if (!newParams.has(p)) changes.push(`parameter removed: ${p}`);
  }
  return changes;
}

function compareEndpoints(oldEp: DigestEndpoint, newEp: DigestEndpoint): string[] {
  const changes: string[] = [];

  if (oldEp.httpMethod !== newEp.httpMethod) {
    changes.push(`HTTP method changed: ${oldEp.httpMethod} → ${newEp.httpMethod}`);
  }
  if (oldEp.path !== newEp.path) {
    changes.push(`path changed: ${oldEp.path} → ${newEp.path}`);
  }

  changes.push(...compareParams(oldEp, newEp));

  if (oldEp.responseRef !== newEp.responseRef) {
    changes.push(
      `response type changed: ${oldEp.responseRef ?? "none"} → ${newEp.responseRef ?? "none"}`,
    );
  }

  if (oldEp.requestRef !== newEp.requestRef) {
    changes.push(
      `request body changed: ${oldEp.requestRef ?? "none"} → ${newEp.requestRef ?? "none"}`,
    );
  }

  if (oldEp.secured !== newEp.secured) {
    const from = oldEp.secured ? "secured" : "open";
    const to = newEp.secured ? "secured" : "open";
    changes.push(`security changed: ${from} → ${to}`);
  }

  return changes;
}

export function diffEndpoints(
  oldGroups: DigestGroup[],
  newGroups: DigestGroup[],
): EndpointDiffResult {
  const oldMap = buildEndpointMap(oldGroups);
  const newMap = buildEndpointMap(newGroups);

  const added: DiffEndpoint[] = [];
  const removed: DiffEndpoint[] = [];
  const modified: DiffEndpoint[] = [];

  for (const [_key, { group, endpoint: oldEp }] of oldMap) {
    const newEntry = newMap.get(endpointKey(group, oldEp));
    if (!newEntry) {
      removed.push(toDiffEndpoint(group, oldEp));
      continue;
    }
    const changes = compareEndpoints(oldEp, newEntry.endpoint);
    if (changes.length > 0) {
      modified.push({ ...toDiffEndpoint(group, oldEp), changes });
    }
  }

  for (const [key, { group, endpoint: newEp }] of newMap) {
    if (!oldMap.has(key)) {
      added.push(toDiffEndpoint(group, newEp));
    }
  }

  return { added, removed, modified };
}
