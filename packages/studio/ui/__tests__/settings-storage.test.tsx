/**
 * @vitest-environment jsdom
 *
 * Settings → Storage: what Studio keeps and the room each part takes, a
 * Clear for each and one for everything — each asks first — a compaction,
 * and the size past which a banner says the database has grown large.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("@/socket/socket-instance", () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));

import type { StorageReport } from "@/features/storage/storage-report";
import { post } from "@/lib/api-client";
import { bindStorageCleared } from "@/socket/storage-cleared-bindings";
import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS } from "@/store/constants";
import { useMockStore } from "@/store/mock-slice";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { mockLog } from "./mock-server-fixture";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const MB = 1024 * 1024;

const ENTRY: PlaygroundHistoryEntry = {
  id: "e1",
  rid: "r1",
  source: "api",
  group: "users",
  method: "list",
  variables: "{}",
  headers: "{}",
  mode: "direct",
  timestamp: 1,
  status: "success",
  statusCode: 200,
  response: [],
};

function report(onDisk: number, fields: Partial<StorageReport> = {}): StorageReport {
  return {
    folder: ".courier",
    persistent: true,
    database: { onDisk, data: 30 * MB, free: onDisk - 30 * MB },
    kinds: [
      { kind: "requests", bytes: 12 * MB, count: 2000, limit: 2000 },
      { kind: "mockLogs", bytes: 3 * MB, count: 480, limit: 500 },
      { kind: "playground", bytes: 2048, count: 12 },
      { kind: "sessions", bytes: 0, count: 0 },
      { kind: "observations", bytes: 2048, count: 3 },
      { kind: "mockStores", bytes: 6 * MB, count: 2 },
      { kind: "backups", bytes: 4096, count: 3 },
    ],
    ...fields,
  };
}

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const storage = () => within(screen.getByRole("region", { name: "Storage" }));

beforeEach(() => {
  vi.mocked(post).mockImplementation(async (url: string) =>
    url === "/api/sessions/list" ? [] : report(214 * MB),
  );
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    settings: DEFAULT_SETTINGS,
    requests: [],
    heldRequests: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings → Storage", () => {
  it("shows the database on disk, and each part's room and count against its limit", async () => {
    await openShell("/settings");

    expect(
      storage().getByText(".courier/studio.db · 214.0 MB on disk, 30.0 MB of data"),
    ).toBeTruthy();
    expect(storage().getByText(/2,000 of the latest 2,000/)).toBeTruthy();
    expect(storage().getByText("12.0 MB")).toBeTruthy();
    expect(
      storage().getByRole("button", { name: "Clear saved sessions" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("clears one part after asking, and shows the sizes Studio answers with", async () => {
    await openShell("/settings");
    vi.mocked(post).mockClear();

    await settle(() =>
      fireEvent.click(storage().getByRole("button", { name: "Clear captured requests" })),
    );
    const dialog = within(storage().getByRole("alertdialog"));
    expect(dialog.getByText(/Delete captured requests — 2,000, 12.0 MB\?/)).toBeTruthy();
    await settle(() => fireEvent.click(dialog.getByRole("button", { name: "Delete" })));

    expect(post).toHaveBeenCalledWith("/api/storage/clear", { kinds: ["requests"] });
    expect(storage().queryByRole("alertdialog")).toBeNull();
  });

  it("clears everything at once, and compacts the database", async () => {
    await openShell("/settings");
    vi.mocked(post).mockClear();

    await settle(() =>
      fireEvent.click(storage().getByRole("button", { name: "Clear everything" })),
    );
    await settle(() =>
      fireEvent.click(
        within(storage().getByRole("alertdialog")).getByRole("button", { name: "Delete" }),
      ),
    );
    await settle(() => fireEvent.click(storage().getByRole("button", { name: "Compact" })));

    expect(post).toHaveBeenCalledWith("/api/storage/clear", {
      kinds: [
        "requests",
        "mockLogs",
        "playground",
        "sessions",
        "observations",
        "mockStores",
        "backups",
      ],
    });
    expect(post).toHaveBeenCalledWith("/api/storage/compact", {});
  });
});

describe("the storage banner", () => {
  it("says so once the database grows past the size set, and goes when dismissed", async () => {
    useStudioStore.setState({
      databaseBytes: 214 * MB,
      settings: { ...DEFAULT_SETTINGS, storageWarnMb: 100 },
    });

    await openShell("/timeline");

    expect(screen.getByText("Studio's database takes 214.0 MB.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Storage" }).getAttribute("href")).toBe(
      "/settings#settings-storage",
    );
    await settle(() =>
      fireEvent.click(screen.getByRole("button", { name: "Dismiss the storage warning" })),
    );

    expect(screen.queryByText(/Studio's database takes/)).toBeNull();
  });

  it("stays away while the database is within the size set", async () => {
    useStudioStore.setState({
      databaseBytes: 214 * MB,
      settings: { ...DEFAULT_SETTINGS, storageWarnMb: 250 },
    });

    await openShell("/timeline");

    expect(screen.queryByText(/Studio's database takes/)).toBeNull();
  });
});

describe("a page told what Storage cleared", () => {
  it("drops its own copy of each part", () => {
    const handlers = new Map<string, (raw: unknown) => void>();
    const socket = {
      on: (event: string, handler: (raw: unknown) => void) => handlers.set(event, handler),
      off: vi.fn(),
    };
    useStudioStore.setState({
      requests: [requestEntry({ id: "a" })],
      shownSession: null,
      playgroundHistory: [ENTRY],
    });
    useMockStore.setState({ logs: [mockLog()] });
    bindStorageCleared(socket as never, useStudioStore.getState);

    handlers.get("storage:cleared")?.({ kinds: ["requests", "mockLogs", "playground"] });

    expect(useStudioStore.getState().requests).toEqual([]);
    expect(useMockStore.getState().logs).toEqual([]);
    expect(useStudioStore.getState().playgroundHistory).toEqual([]);
  });

  it("goes back to the live requests when the session it shows is gone", () => {
    const handlers = new Map<string, (raw: unknown) => void>();
    const socket = {
      on: (event: string, handler: (raw: unknown) => void) => handlers.set(event, handler),
      off: vi.fn(),
    };
    useStudioStore.setState({
      shownSession: { id: "s1", name: "Saved" },
      requests: [requestEntry()],
    });
    bindStorageCleared(socket as never, useStudioStore.getState);

    handlers.get("storage:cleared")?.({ kinds: ["sessions"] });

    expect(useStudioStore.getState().shownSession).toBeNull();
  });

  it("keeps the room the database takes, as Studio says it", () => {
    const handlers = new Map<string, (raw: unknown) => void>();
    const socket = {
      on: (event: string, handler: (raw: unknown) => void) => handlers.set(event, handler),
      off: vi.fn(),
    };
    bindStorageCleared(socket as never, useStudioStore.getState);

    handlers.get("storage:size")?.({ onDisk: 5 * MB });
    handlers.get("storage:size")?.({ onDisk: "a lot" });

    expect(useStudioStore.getState().databaseBytes).toBe(5 * MB);
  });
});
