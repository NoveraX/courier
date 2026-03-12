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

/**
 * Starts the DevTools server as a detached child process.
 * Probes `/api/health` first to avoid duplicate servers.
 *
 * The child is detached from the parent's process group so it
 * does NOT receive Ctrl+C signals directly. Instead, we kill
 * it explicitly via `exit` and signal handlers on the parent.
 */
export function startDevToolsServer(options: ResolvedOptions): () => void {
  let child: ChildProcess | undefined;

  const stop = (): void => {
    if (!child?.pid) return;
    try {
      // Detached child needs negative pid to kill process group
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already exited
    }
    child = undefined;
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

  return () => {
    stop();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.off("exit", stop);
  };
}
