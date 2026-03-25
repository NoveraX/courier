/**
 * Shared types for apis write routes.
 */

import type { GenerateOptions, ParsedSpec } from "../apis";
import type { SpecImportType } from "../apis/registry/types";

export interface WriteBody {
  files: { path: string; content: string }[];
  sourceName?: string;
  spec?: ParsedSpec;
  specUrl?: string;
  importType?: SpecImportType;
  options?: GenerateOptions;
}

export interface WriteResult {
  written: number;
  merged: number;
  deleted?: number;
  files: { path: string; status: string }[];
}
