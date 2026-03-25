/**
 * Runtime environment store — holds process.env snapshots from connected app sessions.
 *
 * Populated by app-namespace on connection:init / connection:sources.
 * Consumed by the scanner to resolve process.env.XXX references in source code.
 * Emits change events so file-watcher can trigger re-scans.
 */

type EnvChangeListener = () => void;

const sessionEnvs = new Map<string, Record<string, string>>();
const listeners = new Set<EnvChangeListener>();

/** Store env snapshot from an app session */
export function setSessionEnv(sessionId: string, env: Record<string, string>): void {
  sessionEnvs.set(sessionId, env);
  for (const listener of listeners) listener();
}

/** Remove env snapshot when session disconnects */
export function removeSessionEnv(sessionId: string): void {
  if (!sessionEnvs.delete(sessionId)) return;
  for (const listener of listeners) listener();
}

/** Resolve a single env var from any connected app session */
export function getRuntimeEnvVar(varName: string): string | null {
  for (const env of sessionEnvs.values()) {
    if (varName in env) return env[varName] ?? null;
  }
  return null;
}

/** Subscribe to env changes. Returns unsubscribe function. */
export function onEnvChange(listener: EnvChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
