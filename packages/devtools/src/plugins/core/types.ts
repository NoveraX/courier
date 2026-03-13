export interface DevToolsPluginOptions {
  /** DevTools server port (default: 4380) */
  port?: number;
  /** DevTools server host (default: "localhost") */
  host?: string;
  /** Enable plugin (default: true in development) */
  enabled?: boolean;
  /** Event filtering */
  filter?: {
    sources?: string[];
    minDuration?: number;
  };
}

export interface ResolvedOptions {
  port: number;
  host: string;
  enabled: boolean;
  filter?: DevToolsPluginOptions["filter"];
}
