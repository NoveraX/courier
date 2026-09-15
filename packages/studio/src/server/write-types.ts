/**
 * Shared types for apis write routes.
 */

import type { CourierImportType } from "@noverax/courier/config";
import type { GenerateOptions, ParsedSpec } from "../apis";

export interface WriteBody {
  files: { path: string; content: string }[];
  sourceName?: string;
  spec?: ParsedSpec;
  specUrl?: string;
  importType?: CourierImportType;
  options?: GenerateOptions;
}

export interface WriteResult {
  written: number;
  merged: number;
  deleted?: number;
  files: { path: string; status: string }[];
}
