/**
 * Handle network simulation and chaos engineering commands from Studio.
 */

import type { MockServer } from "../server/create-mock-server";
import { send } from "./worker-ipc";

type CmdResult = { ok: boolean; data?: unknown; error?: string };

export function handleNetworkCommand(server: MockServer, cmd: Record<string, unknown>): CmdResult {
  const raw = (cmd.config ?? {}) as Record<string, unknown>;
  const state = server.networkState;
  const prevPreset = state.latencyPreset;

  const latency = normalizeLatency(raw.latency);
  state.mergeConfig({
    latency,
    bandwidth: raw.bandwidth as number | undefined,
    distribution: extractDistribution(raw.latency),
    routeOverrides: raw.routeOverrides as Parameters<typeof state.mergeConfig>[0]["routeOverrides"],
    stopConditions: raw.stopConditions as Parameters<typeof state.mergeConfig>[0]["stopConditions"],
    errorRate: raw.errorRate as number | undefined,
    faultWeights: raw.faultWeights as Parameters<typeof state.mergeConfig>[0]["faultWeights"],
  });

  state.latencyPreset = (cmd.preset as string) ?? state.latencyPreset;
  state.latencyStartedAt = latency ? Date.now() : null;
  state.resetMetrics();
  emitPresetTransition(prevPreset, state.latencyPreset, "none");
  emitNetworkState(server);
  return { ok: true, data: { updated: true } };
}

export function handleChaosCommand(server: MockServer, cmd: Record<string, unknown>): CmdResult {
  const raw = (cmd.config ?? {}) as Record<string, unknown>;
  const state = server.networkState;
  const prevPreset = state.chaosPreset;
  const errorRate = raw.errorRate as number | undefined;

  state.mergeConfig({
    errorRate,
    faultWeights: raw.faultWeights as Parameters<typeof state.mergeConfig>[0]["faultWeights"],
    stopConditions: raw.stopConditions as Parameters<typeof state.mergeConfig>[0]["stopConditions"],
  });

  state.chaosPreset = (errorRate ?? 0) > 0 ? ((cmd.preset as string) ?? "unstable") : "none";
  state.chaosStartedAt = (errorRate ?? 0) > 0 ? Date.now() : null;
  state.resetMetrics();
  emitPresetTransition(prevPreset, state.chaosPreset, "none");
  emitNetworkState(server);
  return { ok: true, data: { updated: true } };
}

export function checkAutoHalt(server: MockServer): void {
  const reason = server.networkState.checkStopConditions();
  if (!reason) return;

  server.networkState.setConfig(undefined);
  server.networkState.resetMetrics();
  send({
    type: "event",
    event: {
      type: "mock:experiment:event",
      eventType: "auto-halted",
      mode: "chaos",
      reason,
      errorRate: 0,
    },
  });
  emitNetworkState(server);
  send({
    type: "event",
    event: { type: "mock:network:config", config: { autoHalted: true, haltReason: reason } },
  });
}

function normalizeLatency(raw: unknown): { min: number; max: number; jitter?: number } | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") return raw === 0 ? undefined : { min: raw, max: raw };
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const min = (o.min as number) ?? 0;
    const max = (o.max as number) ?? 0;
    if (min === 0 && max === 0) return undefined;
    return { min, max, jitter: o.jitter as number | undefined };
  }
  return undefined;
}

function extractDistribution(raw: unknown): "uniform" | "normal" | "log-normal" | undefined {
  if (raw && typeof raw === "object" && "distribution" in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>).distribution as "uniform" | "normal" | "log-normal";
  }
  return undefined;
}

/** Compare prev/next preset names and emit appropriate experiment events */
function emitPresetTransition(prev: string, next: string, offValue: string): void {
  if (prev === next) return;
  const wasActive = prev !== offValue && prev !== "none" && prev !== "stable";
  const isActive = next !== offValue && next !== "none" && next !== "stable";

  if (wasActive) {
    send({
      type: "event",
      event: { type: "mock:experiment:event", eventType: "stopped", mode: prev, errorRate: 0 },
    });
  }
  if (isActive) {
    send({
      type: "event",
      event: { type: "mock:experiment:event", eventType: "started", mode: next, errorRate: 0 },
    });
  }
}

function emitNetworkState(server: MockServer): void {
  const state = server.networkState;
  const cfg = state.getGlobalConfig();
  send({
    type: "event",
    event: {
      type: "mock:network:config",
      config: {
        latency: cfg?.latency ?? 0,
        errorRate: cfg?.errorRate ?? 0,
        faultWeights: cfg?.faultWeights ?? [],
        bandwidth: cfg?.bandwidth ?? 0,
        distribution: cfg?.distribution ?? "uniform",
        routeOverrides: cfg?.routeOverrides ?? [],
        stopConditions: cfg?.stopConditions ?? null,
        startedAt: state.startedAt,
        latencyPreset: state.latencyPreset,
        latencyStartedAt: state.latencyStartedAt,
        chaosPreset: state.chaosPreset,
        chaosStartedAt: state.chaosStartedAt,
      },
    },
  });
}
