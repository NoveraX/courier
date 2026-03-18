/**
 * Scans TypeScript files for defineApi/defineGroup/endpoint patterns.
 */

import { extractBalancedBlock } from "./parse-utils";
import { resolveEnvVar } from "./resolve-env";
import { extractEndpoints } from "./scan-endpoint";
import type { ScannedGroup, ScannedSource } from "./types";

/** Check if a file contains nexus API patterns */
export function isNexusFile(content: string): boolean {
  return content.includes("defineApi(") || content.includes("defineGroup(");
}

/** Extract first defineApi() source from a file */
export function extractSource(content: string, filePath: string): Partial<ScannedSource> | null {
  const re = /(?:export\s+)?const\s+(\w+)\s*=\s*defineApi\(\{/g;
  const match = re.exec(content);
  if (!match) return null;

  const name = match[1];
  const baseURL = extractStringProp(content, match.index, "baseURL");
  const hasClient = content.includes("createCaller(") || content.includes("createProxyCaller(");

  /* Extract inline endpoints from defineApi({ endpoints: { ... } }) */
  const inlineEndpoints = extractEndpointsBlock(content, match.index);
  const endpoints = inlineEndpoints ? extractEndpoints(inlineEndpoints) : [];

  return {
    name,
    baseURL: baseURL ?? "",
    filePath,
    hasClient,
    groups: [],
    isImported: false,
    inlineEndpoints: endpoints,
  };
}

/** Extract all defineGroup() calls from a file */
export function extractGroups(content: string, filePath: string): ScannedGroup[] {
  const re = /(?:export\s+)?const\s+(\w+)\s*=\s*defineGroup\(\{/g;
  const groups: ScannedGroup[] = [];

  for (const match of content.matchAll(re)) {
    const name = match[1] ?? "unknown";
    const prefix = extractStringProp(content, match.index, "prefix") ?? "";
    const block = extractEndpointsBlock(content, match.index);
    const endpoints = block ? extractEndpoints(block) : [];
    groups.push({ name, prefix, filePath, endpoints });
  }

  return groups;
}

/** Extract a string property value near a given position */
function extractStringProp(content: string, startPos: number, prop: string): string | null {
  /* Search within ~500 chars after the match position */
  const region = content.slice(startPos, startPos + 500);
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* 1. Try string literal: baseURL: "https://..." */
  const strRe = new RegExp(`${escaped}:\\s*["'\`]([^"'\`]*)["'\`]`);
  const strMatch = region.match(strRe);
  if (strMatch?.[1]) return strMatch[1];

  /* 2. Try process.env.XXX (with optional ?? or || fallback) */
  const envRe = new RegExp(
    `${escaped}:\\s*process\\.env(?:\\.|\\[["'])([A-Z_][A-Z0-9_]*)(?:["']\\])?` +
      `(?:\\s*(?:\\?\\?|\\|\\|)\\s*["'\`]([^"'\`]*)["'\`])?`,
  );
  const envMatch = region.match(envRe);
  if (envMatch?.[1]) {
    return resolveEnvVar(envMatch[1]) ?? envMatch[2] ?? null;
  }

  return null;
}

/** Extract the endpoints: { ... } block from a defineGroup/defineApi call */
function extractEndpointsBlock(content: string, startPos: number): string | null {
  const marker = "endpoints:";
  /* Find the defineGroup/defineApi block boundary first */
  const blockEnd = findBlockEnd(content, startPos);
  const markerIdx = content.indexOf(marker, startPos);
  if (markerIdx < 0 || (blockEnd > 0 && markerIdx > blockEnd)) return null;

  const openBrace = content.indexOf("{", markerIdx + marker.length);
  if (openBrace < 0) return null;

  return extractBalancedBlock(content, openBrace, "{", "}");
}

/** Find the end of the current defineGroup/defineApi block */
function findBlockEnd(content: string, startPos: number): number {
  const openBrace = content.indexOf("{", startPos);
  if (openBrace < 0) return -1;
  const block = extractBalancedBlock(content, openBrace, "{", "}");
  return block ? openBrace + block.length - 1 : -1;
}
