import type { TerminalStyle } from "@noverax/courier/internal";

import type { UpgradeView } from "./setup-report";

/**
 * What an upgrade moves, under its plan's title: each package's range as
 * written and as the upgrade writes it, in the manifest it is in — one
 * left as written says why — and each breaking change of the releases it
 * crosses, with where its notes say what to write instead.
 *
 * @param view - What the upgrade moves
 * @param style - How the terminal is painted
 * @returns The lines
 * @example
 * ```ts
 * upgradeLines({ from: "0.4.0", to: "0.5.0", packages, notes }, style);
 * ```
 */
export function upgradeLines(view: UpgradeView, style: TerminalStyle): string[] {
  const width = Math.max(0, ...view.packages.map((each) => each.name.length));
  const packages = view.packages.map((each) => {
    const where = each.manifest === "package.json" ? "" : `  ${style.dim(each.manifest)}`;
    const name = each.name.padEnd(width);
    if (each.to === undefined)
      return `  ${style.yellow("!")} ${name}  ${each.from}  ${style.dim(`left as written: ${each.why ?? ""}`)}${where}`;
    return `  ${style.yellow("~")} ${name}  ${each.from} → ${style.bold(each.to)}${where}`;
  });
  const notes = view.notes.map(
    (note) => `  ${style.bold(note.release)}  ${note.title}  ${style.dim(note.docs)}`,
  );
  return [
    "",
    `Courier ${view.from} → ${view.to}`,
    ...packages,
    ...(notes.length > 0 ? ["", "Breaking changes", ...notes] : []),
  ];
}
