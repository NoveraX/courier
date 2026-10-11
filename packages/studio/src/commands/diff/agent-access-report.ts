import type { AgentChanges, OfferedTool } from "./agent-access";

/**
 * Whether a change does anything to what agents may call — a pull request
 * comment is written for it, as for a change to the definition.
 *
 * @param changes - What the change does to agents' tools
 * @returns Whether there is anything to report
 * @example
 * ```ts
 * changesAgentAccess(agentChanges(base, head)); // true once a tool is added
 * ```
 */
export function changesAgentAccess(changes: AgentChanges): boolean {
  return (
    changes.added.length + changes.removed.length + changes.changed.length > 0 ||
    changes.problems.length > 0
  );
}

/**
 * The agent section of the report as text: each tool added, kept from
 * agents or offered differently, and how many agents may call after it.
 *
 * @param changes - What the change does to agents' tools
 * @returns The lines, ending in a line break
 * @example
 * ```ts
 * process.stdout.write(agentAccessText(changes));
 * ```
 */
export function agentAccessText(changes: AgentChanges): string {
  const lines = [`Agent access: ${summaryOf(changes)}`];
  for (const tool of changes.added)
    lines.push(`  + ${tool.path}  ${tool.tool}  ${accessOf(tool)}  ${tool.reason}`);
  for (const tool of changes.removed)
    lines.push(`  - ${tool.path}  ${tool.tool}  ${accessOf(tool)}`);
  for (const { before, after } of changes.changed) {
    lines.push(
      `  ~ ${after.path}  ${renamed(before, after)}  ${accessOf(before)} → ${accessOf(after)}`,
    );
  }
  for (const problem of changes.problems) lines.push(`  ! ${problemText(problem)}`);
  return `${lines.join("\n")}\n`;
}

/**
 * The agent section of the report as Markdown for a pull request: a table
 * of each tool added, kept from agents or offered differently, what a call
 * does, and what offers it.
 *
 * @param changes - What the change does to agents' tools
 * @returns The Markdown, ending in a line break
 * @example
 * ```ts
 * appendFileSync(process.env.GITHUB_STEP_SUMMARY, agentAccessMarkdown(changes));
 * ```
 */
export function agentAccessMarkdown(changes: AgentChanges): string {
  const rows = [
    ...changes.added.map((tool) => row("Added", tool.path, tool.tool, accessOf(tool), tool.reason)),
    ...changes.removed.map((tool) =>
      row("Kept from agents", tool.path, tool.tool, accessOf(tool), ""),
    ),
    ...changes.changed.map(({ before, after }) =>
      row(
        "Changed",
        after.path,
        renamed(before, after),
        `${accessOf(before)} → ${accessOf(after)}`,
        after.reason,
      ),
    ),
  ];
  const lines = ["## Agent access", "", `**${summaryOf(changes)}**`];
  if (rows.length > 0) {
    lines.push(
      "",
      "| | Endpoint | Tool | A call | Offered by |",
      "| --- | --- | --- | --- | --- |",
      ...rows,
    );
  }
  for (const problem of changes.problems) lines.push("", `> ${problemText(problem)}`);
  return `${lines.join("\n")}\n`;
}

function problemText(problem: AgentChanges["problems"][number]): string {
  const when = problem.side === "base" ? "before the change" : "after the change";
  return `The MCP server would not start ${when}: ${problem.message}`;
}

function summaryOf(changes: AgentChanges): string {
  const offered = `agents may call ${changes.offered} tool${changes.offered === 1 ? "" : "s"}`;
  if (!changes.baseRecorded) {
    return `${offered}; the base, OpenAPI documents written before, does not record what agents could call`;
  }
  const parts = [
    counted(changes.added.length, "added"),
    counted(changes.removed.length, "kept from agents"),
    counted(changes.changed.length, "changed"),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? `no change: ${offered}` : `${parts.join(", ")}: ${offered}`;
}

function counted(count: number, what: string): string | undefined {
  return count === 0 ? undefined : `${count} tool${count === 1 ? "" : "s"} ${what}`;
}

function accessOf(tool: OfferedTool): string {
  return `${tool.access}${tool.confirm ? ", a person confirms" : ""}`;
}

function renamed(before: OfferedTool, after: OfferedTool): string {
  return before.tool === after.tool ? after.tool : `${before.tool} → ${after.tool}`;
}

function row(kind: string, path: string, tool: string, call: string, by: string): string {
  return `| ${kind} | \`${path}\` | \`${tool}\` | ${call} | ${by.replace(/\|/g, "\\|")} |`;
}
