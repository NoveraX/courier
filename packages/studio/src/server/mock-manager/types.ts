import type { ChildScenarioMeta, DescribedRoute } from "@noverax/courier-mock/managed";
import type { Namespace } from "socket.io";

import type { MockRegistry } from "../mock-registry";
import type { MockLog } from "../storage/mock-log";
import type { WatcherStatus } from "../watcher-status";
import type { CommandReply } from "./command-replies";

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
  actualPort?: number | undefined;
  url?: string | undefined;
  pid?: number | undefined;
  startedAt?: number | undefined;
  lastError?: string | undefined;
  routes: DescribedRoute[];
  collections: Array<{ name: string; count: number; records: unknown[] }>;
  scenarios: ScenarioMeta[];
  activeScenario: string | null;
  /** Network simulation presets — persisted for UI restore on reconnect */
  latencyPreset?: string | undefined;
  latencyStartedAt?: number | null | undefined;
  chaosPreset?: string | undefined;
  chaosStartedAt?: number | null | undefined;
  networkConfig?: Record<string, unknown> | undefined;
}

export interface CoordinatorConfig {
  mockRegistry: MockRegistry;
  uiNamespace: Namespace;
  /** Where the ports assigned to mocks that name none begin; read at the first assignment. */
  basePort: () => number;
  watcherStatus?: WatcherStatus;
  /** Where Studio keeps the transforms of the project's modules now, told to each worker it starts. */
  transformCacheDirectory: () => string | null;
  /** The file a mock's worker keeps its store in; `null` when Studio keeps none for it. */
  storeFile: (mockKey: string) => string | null;
  /** Keeps the requests each mock answered, for the pages that connect later. */
  mockLog?: MockLog;
}

/** What a mock's worker is started with. */
export interface SpawnRequest {
  serverId: string;
  /** The `courier.mocks.*` the worker loads the mock from. */
  mocksFile: string;
  mockKey: string;
  /** Listened on exactly; a taken one is reported by the worker. */
  port: number;
}

/** The worker processes of Studio's managed mocks, by mock; see `createProcessManager`. */
export interface ProcessManager {
  /** Start the worker for a mock; it reports back once it listens. */
  spawn(request: SpawnRequest): { pid: number };
  /** Stop a mock's worker: asked first, then signalled; resolves once it has exited. */
  kill(serverId: string): Promise<void>;
  /** Stop every worker, and drop the fallback that kills them when Studio's process exits. */
  dispose(): Promise<void>;
  /** Whether the mock has a worker that has not exited yet. */
  has(serverId: string): boolean;
  /** Send a command to a mock's worker; resolves with its answer, or why none will come. */
  sendCommand(serverId: string, command: Record<string, unknown>): Promise<CommandReply>;
}

/** A mock Studio tracks, as far as an edit of the mocks file concerns it. */
export interface MockSummary {
  key: string;
  /** Whether its worker runs, so the edit restarts it. */
  alive: boolean;
  /** The port it is on, or will be on when it starts. */
  port: number;
  /** Whether the mocks file names that port, rather than Studio assigning it. */
  portDeclared: boolean;
}
