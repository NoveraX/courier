/**
 * Shared types for apis write routes.
 */

import type { NexusImportType } from "@noverax/nexus/config";
import type { GenerateOptions, ParsedSpec } from "../apis";

export interface WriteBody {
  files: { path: string; content: string }[];
  sourceName?: string;
  spec?: ParsedSpec;
  specUrl?: string;
  importType?: NexusImportType;
  options?: GenerateOptions;
}

export interface WriteResult {
  written: number;
  merged: number;
  deleted?: number;
  files: { path: string; status: string }[];
}
