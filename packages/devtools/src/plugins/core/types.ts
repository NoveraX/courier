export interface DevToolsPluginOptions {
  /** DevTools server port (default: 4380) */
  port?: number;
  /** DevTools server host (default: "localhost") */
  host?: string;
  /** Auto-start DevTools server on build start (default: false) */
  autoStart?: boolean;
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
  autoStart: boolean;
  enabled: boolean;
  filter?: DevToolsPluginOptions["filter"];
}
