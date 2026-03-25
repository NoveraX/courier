import type { Namespace } from "socket.io";

export type ServerStatus =
  | "declared"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "restarting";

export interface ScenarioMeta {
  name: string;
  endpointCount: number;
  isActive: boolean;
  endpoints: Array<{
    group: string;
    endpoint: string;
    httpMethod: string;
    behavior: "resolves" | "returns" | "rejects" | "custom";
    latency?: number;
  }>;
}

export interface ServerState {
  serverId: string;
  name: string;
  filePath: string;
  relativePath: string;
  configuredPort: number;
  status: ServerStatus;
  origin: "devtools" | "external";
  actualPort?: number;
  url?: string;
  pid?: number;
  startedAt?: number;
  lastError?: string;
  routes: Array<Record<string, unknown>>;
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
  mocksDir: string;
  uiNamespace: Namespace;
  basePort: number;
}
