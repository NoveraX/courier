import type * as vscode from "vscode";

const LATEST_FAILURES = { prompt: "", command: "failures", label: "The latest failures" };
const AUDIT = { prompt: "", command: "audit", label: "What the audit found" };

const FOLLOWUPS = new Map<string, readonly vscode.ChatFollowup[]>([
  ["status", [LATEST_FAILURES, AUDIT]],
  [
    "failures",
    [
      { prompt: "Why do these calls fail, and what should change?", label: "Why do they fail?" },
      AUDIT,
    ],
  ],
  [
    "audit",
    [
      {
        prompt: "Which of these findings should be fixed first, and how?",
        label: "What to fix first?",
      },
    ],
  ],
  ["endpoint", [LATEST_FAILURES]],
  ["ask", [{ prompt: "", command: "status", label: "How the endpoints are doing" }]],
]);

/**
 * What to ask @courier next, after each answer: the failures after the
 * status, why they fail after the failures, what to fix first after the
 * audit.
 *
 * @example
 * ```ts
 * participant.followupProvider = followups;
 * ```
 */
export const followups: vscode.ChatFollowupProvider = {
  provideFollowups(result) {
    const command: unknown = result.metadata?.command;
    return typeof command === "string" ? [...(FOLLOWUPS.get(command) ?? [])] : [];
  },
};
