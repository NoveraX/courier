import type { Server } from "node:http";
import { EDIT_FINISH_BUDGET_MS } from "./mocks-edit/edit-timing";
import { closeFormatterThread } from "./project-format/formatter-host";
import { clearStudioServerState } from "./runtime-namespace-state";

/** What a running Studio holds open, each closed in its turn. */
export interface OpenStudio {
  /** The project root, symlinks resolved. */
  root: string;
  startup: { close(): Promise<void> };
  project: { finishEdits(budgetMs: number): Promise<void>; stop(): void };
  mockManager: { stop(): Promise<void> };
  playgroundRouter: { dispose(): void };
  io: { close(): void };
  storage: { stop(): void };
  stores: { close(): void };
  /** The file that tells editors where Studio runs. */
  address: { forget(): void };
  httpServer: Server;
}

/**
 * Close a running Studio: it stops telling editors where it runs and stops
 * listening first, lets an edit it is writing finish, stops the mocks, the
 * formatter threads and the watchers, closes the sockets and the stores,
 * and then the server.
 *
 * @param studio - What it holds open
 * @returns Once the server has closed
 * @throws {Error} When the HTTP server fails to close
 * @example
 * ```ts
 * await closeStudio({ root, startup, project, mockManager, playgroundRouter, io, storage, stores, address, httpServer });
 * ```
 */
export async function closeStudio(studio: OpenStudio): Promise<void> {
  const { startup, project, mockManager, playgroundRouter, io, storage, stores, httpServer } =
    studio;
  studio.address.forget();
  await startup.close();
  await project.finishEdits(EDIT_FINISH_BUDGET_MS);
  await mockManager.stop();
  await closeFormatterThread(studio.root);
  project.stop();
  playgroundRouter.dispose();
  clearStudioServerState();
  io.close();
  storage.stop();
  stores.close();
  if (!httpServer.listening) return;
  return new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}
