import { basename } from "node:path";
import type { ServerState } from "./types";

/** What Studio knows of the project's `courier.mocks.*`, as the UI is told it. */
export interface MocksFileStatus {
  /** Absolute path of the file; `null` when the project declares no mocks. */
  file: string | null;
  /** Why the file did not load; `null` when it loaded, or there is none. */
  error: string | null;
}

interface MocksFileContext {
  servers: Map<string, ServerState>;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
  /** Tells every connected UI the new status. */
  broadcast: (status: MocksFileStatus) => void;
}

/** The mocks file's status, the file mocks start from, and how to update both. */
interface MocksFileState {
  set(next: MocksFileStatus): void;
  status(): MocksFileStatus;
  /** The file mocks start from: the last one that loaded. */
  path(): string | null;
}

/**
 * Track whether the mocks file loaded. While it does not, the mocks it
 * declared last stay registered, and each says why nothing newer applies;
 * the next load that works clears that again.
 *
 * @param ctx - The coordinator's mock states and how to report them
 * @returns The status, the file mocks start from, and how to update both
 */
export function createMocksFileState(ctx: MocksFileContext): MocksFileState {
  let status: MocksFileStatus = { file: null, error: null };
  /* The file mocks start from: the last one that loaded. */
  let loaded: string | null = null;
  /* The reason given on each kept mock, so a later load clears only that. */
  let reported: string | null = null;

  function report(reason: string | null): void {
    for (const [serverId, state] of ctx.servers) {
      if (reason !== null) ctx.updateAndEmit(serverId, { lastError: reason });
      else if (state.lastError === reported) ctx.updateAndEmit(serverId, { lastError: undefined });
    }
    reported = reason;
  }

  function set(next: MocksFileStatus): void {
    if (next.error === null) loaded = next.file;
    const reason =
      next.error === null
        ? null
        : `${basename(next.file ?? "courier.mocks")} failed to load: ${next.error}. ` +
          "A running mock keeps serving its last working definition.";
    if (reason !== reported) report(reason);
    if (next.file === status.file && next.error === status.error) return;
    status = next;
    ctx.broadcast(status);
  }

  return { set, status: () => status, path: () => loaded };
}
