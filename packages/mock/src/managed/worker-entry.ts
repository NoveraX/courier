/**
 * Child process entry point for managed mock servers.
 *
 * Loaded by Studio via child_process.fork().
 * Receives config path via IPC, loads it, starts the server,
 * and forwards events back to parent via IPC.
 */

import type { RouteInfo } from "../auto/route-analyzer";
import { introspectScenario } from "../auto/scenario-introspect";
import type { MockServer } from "../server/create-mock-server";
import { isMockServerDefinition } from "./define-mock-server";
import type { ChildMessage, ChildScenarioMeta, ParentMessage } from "./types";

const PARENT_CHECK_INTERVAL = 5000;

// Ensure child dies if parent dies
const parentPid = process.ppid;
const parentCheck = setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    process.exit(0);
  }
}, PARENT_CHECK_INTERVAL);

function send(msg: ChildMessage): void {
  process.send?.(msg);
}

function sendError(message: string, fatal: boolean): void {
  send({ type: "error", message, fatal });
  if (fatal) {
    clearInterval(parentCheck);
    process.exit(1);
  }
}

function sendStoreSnapshot(server: MockServer): void {
  send({
    type: "event",
    event: {
      type: "mock:store:snapshot",
      collections: server.store.list().map((name) => ({
        name,
        count: server.store.collection(name).count(),
        records: server.store.collection(name).getAll(),
      })),
    },
  });
}

function buildScenarioMeta(
  allScenarios: Record<string, unknown>,
  routes: RouteInfo[],
): ChildScenarioMeta[] {
  return Object.keys(allScenarios).map((name) => {
    const scenario = allScenarios[name] as {
      apply?: unknown;
      description?: string;
      tags?: string[];
    } | null;
    const result =
      scenario && typeof scenario.apply === "function"
        ? introspectScenario(scenario as Parameters<typeof introspectScenario>[0], routes)
        : { endpoints: [], stateTransitions: [], hasStateMachine: false };
    const { endpoints, stateTransitions, hasStateMachine } = result;
    return {
      name,
      description: scenario?.description,
      tags: scenario?.tags,
      endpointCount: endpoints.length,
      isActive: false,
      hasStateMachine,
      stateTransitions,
      endpoints,
    };
  });
}

async function loadConfig(configPath: string): Promise<unknown> {
  const url = `${configPath}?t=${Date.now()}`;
  const mod = await import(url);
  return mod.mockServer ?? mod.default;
}

async function startServer(configPath: string, allocatedPort: number): Promise<void> {
  const config = await loadConfig(configPath);

  if (!isMockServerDefinition(config)) {
    return sendError(
      `File ${configPath} does not export a valid mockServer. Use defineMockServer().`,
      true,
    );
  }

  const { createAutoMockServer } = await import("../auto/create-auto-server");

  if (!config.source) {
    return sendError("Mock server requires a source. Pass source to defineMockServer().", true);
  }

  // Use port allocated by Studio coordinator, fall back to config
  const port = allocatedPort > 0 ? allocatedPort : config.port;

  const server = createAutoMockServer({
    source: config.source,
    port,
    cors: config.cors,
    admin: config.admin,
    log: config.log,
    seed: config.seed,
    overrides: config.overrides,
    scenarios: config.scenarios,
    studio: false,
  });

  const { analyzeRoutes, getSourceGroupNames } = await import("../auto/route-analyzer");
  const analyzedRoutes = config.source ? analyzeRoutes(config.source) : [];
  const groupNames = config.source ? getSourceGroupNames(config.source) : new Set<string>();

  const uiRoutes = analyzedRoutes.map((r) => ({
    group: groupNames.has(r.group) ? r.group : "",
    endpoint: r.endpoint,
    httpMethod: r.httpMethod,
    path: r.path,
    fullPath: r.fullPath,
    source: server.getRouteSource(r.group, r.endpoint),
    hits: 0,
  }));

  // Wire request lifecycle hooks → IPC events for Studio Logs tab
  server.requestHooks.onStart = (
    id,
    httpMethod,
    path,
    group,
    endpoint,
    variables,
    requestHeaders,
  ) => {
    send({
      type: "event",
      event: {
        type: "mock:request:start",
        requestId: id,
        httpMethod,
        path,
        group,
        endpoint,
        variables,
        requestHeaders,
      },
    });
  };
  server.requestHooks.onEnd = (
    id,
    status,
    data,
    duration,
    latencyInjected,
    scenarioState,
    responseHeaders,
  ) => {
    send({
      type: "event",
      event: {
        type: "mock:request:end",
        requestId: id,
        status,
        data,
        duration,
        latencyInjected,
        scenarioState,
        responseHeaders,
      },
    });
    checkAutoHalt(server);
  };
  server.requestHooks.onError = (id, status, message, duration) => {
    send({
      type: "event",
      event: { type: "mock:request:error", requestId: id, status, message, duration },
    });
    checkAutoHalt(server);
  };

  const info = await server.start();

  const scenarioMeta = buildScenarioMeta(server.scenarios, analyzedRoutes);

  send({
    type: "ready",
    port: info.port,
    url: info.url,
    routes: uiRoutes,
    scenarios: scenarioMeta,
    collections: server.store.list().map((name) => ({
      name,
      count: server.store.collection(name).count(),
      records: server.store.collection(name).getAll(),
    })),
  });

  // Handle commands from parent
  process.on("message", async (msg: ParentMessage) => {
    if (msg.type === "stop") {
      await server.stop();
      send({ type: "stopped" });
      clearInterval(parentCheck);
      process.exit(0);
    }
    if (msg.type === "command") {
      const result = await handleStoreCommand(server, analyzedRoutes, msg.command);
      send({ type: "command-result", requestId: msg.requestId, ...result });

      const action = (msg.command as Record<string, unknown>).action as string;
      if (action === "mock:scenario:apply") {
        const appliedName = (result.data as Record<string, unknown> | undefined)?.applied as
          | string
          | undefined;
        if (appliedName) {
          const updated = buildScenarioMeta(server.scenarios, analyzedRoutes).map(
            (s: ChildScenarioMeta) => ({
              ...s,
              isActive: s.name === appliedName,
            }),
          );
          // Recalculate route sources after scenario change
          const freshRoutes = analyzedRoutes.map((r) => ({
            group: groupNames.has(r.group) ? r.group : "",
            endpoint: r.endpoint,
            httpMethod: r.httpMethod,
            path: r.path,
            fullPath: r.fullPath,
            source: server.getRouteSource(r.group, r.endpoint),
            hits: 0,
          }));
          send({
            type: "event",
            event: {
              type: "mock:scenario:active",
              scenario: appliedName,
              scenarios: updated,
              routes: freshRoutes,
            },
          });
        }
      } else if (action !== "mock:network:set" && action !== "mock:chaos:set") {
        sendStoreSnapshot(server);
      }
    }
  });
}

// ── Store command handler ────────────────────────────────────────────────────

async function handleStoreCommand(
  server: MockServer,
  routes: RouteInfo[],
  cmd: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const action = cmd.action as string;
    const collection = cmd.collection as string;

    switch (action) {
      case "mock:scenario:apply": {
        const name = cmd.scenario as string;
        const scenario = server.scenarios[name];
        if (!scenario) return { ok: false, error: `Scenario "${name}" not found` };
        server.applyScenario(scenario);
        return { ok: true, data: { applied: name } };
      }
      case "mock:store:seed": {
        const count = (cmd.count as number) ?? 20;
        const { seedAllCollections } = await import("../auto/auto-scenario");
        seedAllCollections(routes, server.store, { seedCount: count });
        return { ok: true };
      }
      case "mock:store:delete": {
        const rawId = cmd.id as string | number;
        if (rawId === "*") {
          server.store.collection(collection).clear();
          return { ok: true };
        }
        const id = parseId(rawId);
        server.store
          .collection(collection)
          .delete((q) => q.where({ id } as Record<string, unknown>));
        return { ok: true };
      }
      case "mock:store:create": {
        const record = cmd.record as Record<string, unknown>;
        const col = server.store.collection(collection);
        return { ok: true, data: col.create(record) };
      }
      case "mock:store:update": {
        const col = server.store.collection(collection);
        col.update((q) => q.where({ id: cmd.id } as Record<string, unknown>), {
          data: cmd.data as Record<string, unknown>,
        });
        return { ok: true };
      }
      case "mock:server:reset":
        server.store.reset();
        server.history.length = 0;
        server.networkState.setConfig(undefined);
        return { ok: true, data: { reset: true } };
      case "mock:network:set":
        return handleNetworkCommand(server, cmd);
      case "mock:chaos:set":
        return handleChaosCommand(server, cmd);
      default:
        return { ok: false, error: `Unknown command: ${action}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Network command handlers ─────────────────────────────────────────────────

type CmdResult = { ok: boolean; data?: unknown; error?: string };

function handleNetworkCommand(server: MockServer, cmd: Record<string, unknown>): CmdResult {
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

function handleChaosCommand(server: MockServer, cmd: Record<string, unknown>): CmdResult {
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

function checkAutoHalt(server: MockServer): void {
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

/** Convert string id to number if numeric, for strict equality matching */
function parseId(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  const num = Number(raw);
  return Number.isNaN(num) ? raw : num;
}

// Wait for start command from parent
process.on("message", (msg: ParentMessage) => {
  if (msg.type === "start") {
    startServer(msg.configPath, msg.port).catch((err) => {
      sendError(err instanceof Error ? err.message : String(err), true);
    });
  }
});
