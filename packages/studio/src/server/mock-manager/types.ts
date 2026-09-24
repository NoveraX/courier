import type { ChildScenarioMeta, DescribedRoute } from "@noverax/courier-mock/managed";
import type { Namespace } from "socket.io";

import type { MockRegistry } from "../mock-registry";
import type { WatcherStatus } from "../watcher-status";

export type ServerStatus =
  | "declared"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "restarting";

/** A scenario as the UI lists it. */
export type ScenarioMeta = ChildScenarioMeta;

export interface ServerState {
  serverId: string;
  name: string;
  /** The `courier.mocks.*` the mock's worker loads it from. */
  mocksFile: string;
  mockKey: string;
  relativePath: string;
  configuredPort: number;
  /** Whether the config named `configuredPort`, which then holds exactly, or Studio assigned it. */
  portDeclared: boolean;
  /** Whether the last definition Studio could read asks to start at launch. */
  autoStart: boolean;
  status: ServerStatus;
  origin: "studio" | "external";
  actualPort?: number;
  url?: string;
  pid?: number;
  startedAt?: number;
  lastError?: string;
  routes: DescribedRoute[];
  collections: Array<{ name: string; count: number; records: unknown[] }>;
  scenarios: ScenarioMeta[];
  activeScenario: string | null;
  /** Network simulation presets — persisted for UI restore on reconnect */
  latencyPreset?: string;
  latencyStartedAt?: number | null;
  chaosPreset?: string;
  chaosStartedAt?: number | null;
  networkConfig?: Record<string, unknown>;
}

export interface CoordinatorConfig {
  mockRegistry: MockRegistry;
  uiNamespace: Namespace;
  basePort: number;
  watcherStatus?: WatcherStatus;
}
