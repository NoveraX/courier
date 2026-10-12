import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";

import { createStudioServer } from "../../src/server";

/** A Studio server running a project, and a UI socket that records what Studio sends it. */
export interface LiveStudio {
  /** Studio's own address. */
  url: string;
  /** The project root. */
  root: string;
  /** The UI socket. */
  ui: Socket;
  /** Every event the UI received, in order, out of the `events` batches it came in. */
  events: Array<Record<string, unknown>>;
  /** Stop the UI socket and Studio, and remove the project. */
  close(): Promise<void>;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/**
 * Start Studio on a free port for a project whose files are given, under the
 * repository's node_modules so a config resolves the workspace packages, and
 * connect a UI socket to it. Resolves once Studio has had its first load.
 *
 * @param files - The project's files by path; none for a project without a config
 * @returns The running Studio
 */
export async function startLiveStudio(files: Record<string, string> = {}): Promise<LiveStudio> {
  const cache = join(__dirname, "../../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "project-"));
  for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);

  const port = await freePort();
  let studio: ReturnType<typeof createStudioServer> | undefined;
  const url = await new Promise<string>((resolve) => {
    studio = createStudioServer({ port, host: "127.0.0.1", projectRoot: root, onReady: resolve });
  });
  const ui = connect(`${url}/ui`, { transports: ["websocket"] });
  const events: Array<Record<string, unknown>> = [];
  ui.on("events", (batch: Array<Record<string, unknown>>) => events.push(...batch));
  await new Promise<void>((resolve) => {
    ui.on("config:status", (status: { state: string }) => {
      if (status.state !== "starting") resolve();
    });
  });

  return {
    url,
    root,
    ui,
    events,
    async close() {
      ui.disconnect();
      await studio?.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * Wait until `check` holds.
 *
 * @param check - What must hold
 * @param what - Named in the error when it never does
 */
export async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
