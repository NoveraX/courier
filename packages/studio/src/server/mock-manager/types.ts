import type { ChildScenarioMeta, DescribedRoute } from "@noverax/courier-mock/managed";
import type { Namespace } from "socket.io";

import type { MockRegistry } from "../mock-registry";
import type { MockConditionsStore } from "../storage/mock-conditions-store";
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
  /** The name under `sources` of the config's source it serves, when it serves one the config declares. */
  source?: string | undefined;
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
  /** The number of the last report of the store applied to `collections`; 0 for the store the mock started with. */
  storeSeq: number;
  scenarios: ScenarioMeta[];
  activeScenario: string | null;
  /** Network simulation presets — persisted for UI restore on reconnect */
  latencyPreset?: string | undefined;
  latencyStartedAt?: number | null | undefined;
  chaosPreset?: string | undefined;
  chaosStartedAt?: number | null | undefined;
  networkConfig?: Record<string, unknown> | undefined;
  /** The network conditions the mocks file declared when the mock last started, as JSON. */
  declaredNetwork?: string | undefined;
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
  /** Keeps the conditions set on each mock, for when it starts again. */
  conditions?: MockConditionsStore;
}

/** What a mock's worker is started with. */
export interface SpawnRequest {
  serverId: string;
  /** The `courier.mocks.*` the worker loads the mock from. */
  mocksFile: string;
  mockKey: string;
  /** The port to listen on, or to start the search for a free one from. */
  port: number;
  /** Whether the developer named `port`, which is then held exactly and a taken one reported. */
  strictPort: boolean;
  /** Ports given to the project's other mocks, which the search for a free one passes over. */
  avoidPorts: number[];
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
