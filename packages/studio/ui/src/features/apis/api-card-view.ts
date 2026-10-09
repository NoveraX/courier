import type { ScannedSource, SourceStatusInfo, SourceSummary } from "@/features/apis/types";
import { shortAgo } from "@/features/explorer/endpoint-key";
import { computeAnalysisStats, countScannedEndpoints } from "./helpers";

/** How much of a source is typed, by one measure. */
export interface QualityRow {
  kind: "response" | "variables" | "schemas";
  label: string;
  count: number;
  total: number;
  tone: "ok" | "warn" | "subtle";
  tip: string;
}

/** An imported API as its card shows it. */
export interface ApiCardView {
  name: string;
  importType: "url" | "file" | "raw";
  origin: string;
  status: { kind: SourceStatusInfo["status"] | "none"; label: string };
  stats: { label: string; value: string }[];
  quality: QualityRow[];
  /** What changed or went wrong, when something did. */
  note: { tone: "warn" | "err"; text: string } | null;
  /** Whether a newer spec waits to be reviewed. */
  update: boolean;
  checked: string;
  /** Whether the spec has a URL to check, and why not when it has none. */
  check: { can: true } | { can: false; why: string };
}

const STATUS_LABEL: Readonly<Record<ApiCardView["status"]["kind"], string>> = {
  "up-to-date": "Up to date",
  "updates-available": "Update available",
  checking: "Checking…",
  error: "Check failed",
  unchecked: "Not checked",
  none: "Not checked",
};

function row(
  kind: QualityRow["kind"],
  label: string,
  { count, total }: { count: number; total: number },
  tip: string,
): QualityRow {
  const tone = total > 0 && count === total ? "ok" : count > 0 ? "warn" : "subtle";
  return { kind, label, count, total, tone, tip };
}

function originOf(registry: SourceSummary | undefined): string {
  if (registry?.fromTraffic) return "read from traffic";
  if (registry?.importType === "raw") return "pasted spec";
  return registry?.specUrl || "uploaded spec";
}

function checkedLabel(status: SourceStatusInfo | undefined, now: number): string {
  if (status?.status === "checking") return "checking…";
  if (status?.checkedAt === undefined) return "not checked yet";
  const ago = now - status.checkedAt;
  return ago < 10_000 ? "checked just now" : `checked ${shortAgo(ago)} ago`;
}

function noteOf(status: SourceStatusInfo | undefined): ApiCardView["note"] {
  if (status?.status === "updates-available")
    return {
      tone: "warn",
      text: "A newer spec is published — review what changed before it is applied",
    };
  if (status?.status === "error") return { tone: "err", text: status.error ?? "The check failed" };
  return null;
}

/**
 * An imported API as its card shows it: where its spec came from, what the
 * last update check found, its size and validation library, how much of it
 * is typed, and what to do next.
 *
 * @param source - The scanned source, with what the registry knows of its import
 * @param status - What the last update check on this page found, if any ran
 * @param now - The time now
 * @returns The card's content
 * @example
 * ```ts
 * apiCardView(source, statuses[source.name], Date.now()).status.label; // "Update available"
 * ```
 */
export function apiCardView(
  source: ScannedSource & { registry?: SourceSummary | undefined },
  status: SourceStatusInfo | undefined,
  now: number,
): ApiCardView {
  const stats = computeAnalysisStats(source);
  const importType = source.registry?.importType ?? "file";
  const kind = status?.status ?? "none";
  return {
    name: source.name,
    importType,
    origin: originOf(source.registry),
    status: { kind, label: STATUS_LABEL[kind] },
    stats: [
      { label: "Endpoints", value: String(countScannedEndpoints(source)) },
      { label: "Groups", value: String(source.groups.length) },
      { label: "Validation", value: source.registry?.options.validation ?? "none" },
    ],
    quality: [
      row("response", "Response types", stats.responseType, "Endpoints with a typed response"),
      row("variables", "Variables types", stats.variablesType, "Endpoints with typed input"),
      row("schemas", "Schemas", stats.validation, "Endpoints with runtime validation"),
    ],
    note: noteOf(status),
    update: kind === "updates-available",
    checked: checkedLabel(status, now),
    check:
      importType === "url"
        ? { can: true }
        : {
            can: false,
            why:
              status?.error ??
              "Imported from a file or a paste — there is no URL to check. Manage it to import a newer spec.",
          },
  };
}

/** A hand-written source as its table row shows it. */
export interface HandWrittenRow {
  name: string;
  endpoints: number;
  groups: number;
  typed: number;
  file: string;
}

/**
 * A hand-written source's row: its endpoints and groups, how many have a
 * typed response, and the file it is declared in.
 *
 * @param source - The scanned source
 * @returns The row
 * @example
 * ```ts
 * handWrittenRow(source); // { name: "api", endpoints: 8, groups: 5, typed: 8, file: "src/api/index.ts" }
 * ```
 */
export function handWrittenRow(source: ScannedSource): HandWrittenRow {
  return {
    name: source.name,
    endpoints: countScannedEndpoints(source),
    groups: source.groups.length,
    typed: computeAnalysisStats(source).responseType.count,
    file: source.filePath,
  };
}
