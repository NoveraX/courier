import type { Namespace } from "socket.io";

export type ServerStatus =
  | "declared"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "restarting";

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
  collections: Array<{ name: string; count: number }>;
}

export interface CoordinatorConfig {
  mocksDir: string;
  uiNamespace: Namespace;
  basePort: number;
}
