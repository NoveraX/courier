/**
 * Shared types for codegen write routes.
 */

import type { GenerateOptions, ParsedSpec } from "../codegen";
import type { SpecImportType } from "../codegen/registry/types";

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
