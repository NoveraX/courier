import type { TerminalStyle } from "@noverax/courier/internal";

import { decisionReason } from "../policy/decision-reason";
import type { Catalog, CatalogEntry } from "../tools/catalog";

/**
 * What `courier-mcp --list` prints: the policy in force, each tool the
 * project offers — its access, whether a person confirms each call, its
 * call and what offered it — then each endpoint kept from agents and why,
 * then what the project should hear about them.
 *
 * @param catalog - The project's tools, decided
 * @param style - How the terminal paints
 * @returns The listing, ending in a line break
 * @example
 * ```ts
 * process.stdout.write(formatToolList(catalog, styleFor(process.stdout)));
 * ```
 */
export function formatToolList(catalog: Catalog, style: TerminalStyle): string {
  const { policy, entries } = catalog;
  const offered = entries.filter((entry) => entry.tool !== undefined);
  const kept = entries.filter((entry) => entry.tool === undefined);
  const lines = [
    style.bold(
      `${offered.length} of ${entries.length} endpoint${entries.length === 1 ? "" : "s"} offered to agents`,
    ),
    style.dim(
      `agents: offer "${policy.offer}", access "${policy.access}", confirm "${policy.confirm}"` +
        (policy.deny.length > 0 ? `, deny ${policy.deny.map((p) => p.text).join(" ")}` : "") +
        (policy.allow.length > 0 ? `, allow ${policy.allow.map((p) => p.text).join(" ")}` : ""),
    ),
  ];
  if (offered.length > 0)
    lines.push(
      "",
      ...table(
        offered.map((entry) => offeredRow(entry, catalog)),
        style,
      ),
    );
  if (kept.length > 0) {
    lines.push("", style.bold("Kept from agents"));
    lines.push(
      ...table(
        kept.map((entry) => keptRow(entry, catalog)),
        style,
      ),
    );
  }
  for (const warning of catalog.warnings)
    lines.push("", style.yellow(`${style.glyphs.warn} ${warning}`));
  return `${lines.join("\n")}\n`;
}

function offeredRow(entry: CatalogEntry, catalog: Catalog): string[] {
  const { decision } = entry;
  const access = decision.offered
    ? `${decision.access}${decision.confirm ? ", a person confirms" : ""}`
    : "";
  return [entry.tool ?? "", access, entry.path, decisionReason(decision, catalog.policy)];
}

function keptRow(entry: CatalogEntry, catalog: Catalog): string[] {
  const why = entry.left ?? decisionReason(entry.decision, catalog.policy);
  return [entry.path, `${entry.verb} ${entry.route === "" ? "/" : entry.route}`, why];
}

/* Rows as columns, each as wide as its widest cell; the last column is dim. */
function table(rows: readonly string[][], style: TerminalStyle): string[] {
  const widths =
    rows[0]?.map((_, at) => Math.max(...rows.map((row) => (row[at] ?? "").length))) ?? [];
  return rows.map((row) => {
    const cells = row.map((cell, at) =>
      at === row.length - 1 ? style.dim(cell) : cell.padEnd(widths[at] ?? 0),
    );
    return `  ${cells.join("  ")}`;
  });
}
