import type { MockServerInfo } from "@/store/mock-slice";
import type { MocksFileStatus } from "@/store/mocks-file-status";
import { mockFailureReason } from "./mock-failure-reason";
import { HAPPY_PATH } from "./scenario-view";

/** What the Mocks page's banner says, in what tone, and what its button does. */
export interface MockBanner {
  tone: "err" | "warn" | "muted";
  title: string;
  detail: string;
  action?: { label: string; kind: "start" | "stop-chaos" | "reset-scenario" } | undefined;
}

const CHAOS_LABELS: Readonly<Record<MockServerInfo["chaosPreset"], string>> = {
  none: "Stable",
  degraded: "Degraded",
  unstable: "Unstable",
  down: "Down",
  custom: "Custom",
};

function fileNameOf(path: string | null): string {
  return path?.split(/[\\/]/).pop() || "courier.mocks.ts";
}

function serverBanner(server: MockServerInfo): MockBanner | undefined {
  const start: MockBanner["action"] = server.managed
    ? { label: "Start server", kind: "start" }
    : undefined;
  if (server.processStatus === "crashed") {
    const reason = server.lastError
      ? mockFailureReason(server.lastError)
      : "it stopped unexpectedly";
    return { tone: "err", title: `${server.name} is not running`, detail: reason, action: start };
  }
  if (server.processStatus === "stopped" || server.processStatus === "declared") {
    return {
      tone: "muted",
      title: "Mock server stopped",
      detail: "Calls routed to it fail until it runs again",
      action: start,
    };
  }
  if (server.chaosPreset !== "none") {
    const rate = Math.round((server.networkConfig?.errorRate ?? 0) * 100);
    return {
      tone: "err",
      title: `Chaos · ${CHAOS_LABELS[server.chaosPreset]}`,
      detail: `${rate}% of responses are faulted`,
      action: { label: "Stop chaos", kind: "stop-chaos" },
    };
  }
  const scenario = server.scenarios.find((s) => s.isActive)?.name ?? server.activeScenario;
  if (!scenario || scenario === HAPPY_PATH) return undefined;
  return {
    tone: "warn",
    title: `Scenario · ${scenario}`,
    detail: "Its overrides answer on matching routes",
    action: { label: "Reset to happy path", kind: "reset-scenario" },
  };
}

/**
 * The banner over the Mocks page: the mocks file that does not load, a
 * server that crashed or stopped, chaos in force, or a scenario other than the happy path on — in
 * that order — with the button that undoes it where Studio can.
 *
 * @param server - The server shown, if any
 * @param file - How the mocks file last loaded
 * @returns The banner, or `undefined` when all is as written
 * @example
 * ```ts
 * mockBannerOf(server, null)?.title; // "Chaos · Unstable"
 * ```
 */
export function mockBannerOf(
  server: MockServerInfo | undefined,
  file: MocksFileStatus | null,
): MockBanner | undefined {
  if (file?.error) {
    return {
      tone: "err",
      title: `${fileNameOf(file.file)} does not load`,
      detail: `Studio keeps serving the mocks it loaded last · ${mockFailureReason(file.error)}`,
    };
  }
  return server ? serverBanner(server) : undefined;
}
