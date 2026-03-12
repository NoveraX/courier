import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { ResolvedOptions } from "./types";

const require = createRequire(import.meta.url);

async function isServerRunning(options: ResolvedOptions): Promise<boolean> {
  try {
    const res = await fetch(`http://${options.host}:${options.port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function resolveCliBin(): string {
  return require.resolve("@noverax/nexus-devtools/cli");
}

// Singleton — prevents signal listener accumulation on HMR rebuilds
let activeCleanup: (() => void) | undefined;

/**
 * Starts the DevTools server as a detached child process.
 * Probes `/api/health` first to avoid duplicate servers.
 *
 * Singleton: repeated calls in watch/HMR mode return the
 * existing cleanup function without spawning a second server
 * or registering duplicate signal handlers.
 */
export function startDevToolsServer(options: ResolvedOptions): () => void {
  if (activeCleanup) return activeCleanup;

  let child: ChildProcess | undefined;

  const stop = (): void => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already exited
    }
    child = undefined;
  };

  const cleanup = (): void => {
    stop();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.off("exit", stop);
    activeCleanup = undefined;
  };

  void isServerRunning(options).then((running) => {
    if (running) return;

    try {
      const bin = resolveCliBin();
      child = spawn(
        process.execPath,
        [bin, `--port=${options.port}`, `--host=${options.host}`, `--cwd=${process.cwd()}`],
        { stdio: "ignore", detached: true },
      );

      child.unref();

      child.on("error", () => {
        // Silently fail — devtools is optional
      });

      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      process.on("exit", stop);
    } catch {
      // CLI not found — skip auto-start
    }
  });

  activeCleanup = cleanup;
  return cleanup;
}
