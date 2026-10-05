/**
 * @vitest-environment jsdom
 */
/**
 * Settings → Session History against a real Studio server: Save current
 * sends the requests this page recorded, the session lands in the
 * project's Studio database, `.courier/studio.db`, and is listed, and a save
 * Studio refuses says why and keeps the dialog open.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useSessionHistory } from "@/settings/use-session-history";
import { useStudioStore } from "@/store";
import { createStudioServer } from "../../src/server/create-studio-server";
import type { StudioServer } from "../../src/server/types";
import { SessionHistorySection } from "../src/views/settings/session-history-section";
import { trafficRequest } from "./playground-fixtures";

let root: string;
let studio: StudioServer | undefined;

/* The page was opened from Studio's link, which carries the project's token. */
const TOKEN = "session-history-save-token-0123456789abcdef";
history.replaceState(null, "", `/#token=${TOKEN}`);

function Harness(): React.ReactElement {
  return <SessionHistorySection history={useSessionHistory()} />;
}

async function startStudio(): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
  /* The page is served by Studio, so the browser resolves its relative API URLs against Studio. */
  const nodeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    nodeFetch(typeof input === "string" ? new URL(input, url) : input, init),
  );
  return url;
}

async function saveSession(name: string): Promise<void> {
  await act(async () => screen.getByRole("button", { name: /Save current/ }).click());
  fireEvent.change(screen.getByLabelText("Session name"), { target: { value: name } });
  await act(async () => screen.getByRole("button", { name: /^Save$/ }).click());
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-session-save-"));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
  mkdirSync(join(root, ".courier"));
  writeFileSync(join(root, ".courier", "studio-token"), `${TOKEN}\n`, { mode: 0o600 });
  useStudioStore.setState({
    requests: [trafficRequest(), trafficRequest({ id: "req-2", status: "error" })],
  });
});

afterEach(async () => {
  cleanup();
  await studio?.close();
  studio = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("saving the current session", () => {
  it("saves the recorded requests to the project and lists the session", async () => {
    await startStudio();
    render(<Harness />);
    await screen.findByText("0 saved sessions");

    await saveSession("Debugging auth");

    await screen.findByText("1 saved session");
    expect(toast.success).toHaveBeenCalledWith("Session saved");
    expect(screen.getByText("Debugging auth")).toBeTruthy();
    /* Loaded at run time, as Studio loads it: Node 22 leaves node:sqlite out of
       the built-ins Vite knows, and a static import had it bundled. */
    const Sqlite: typeof DatabaseSync = process.getBuiltinModule("node:sqlite").DatabaseSync;
    const db = new Sqlite(join(root, ".courier", "studio.db"), { readOnly: true });
    const rows = db.prepare("SELECT body FROM sessions").all();
    db.close();
    expect(rows.map((row) => JSON.parse(String(row.body)))).toEqual([
      expect.objectContaining({
        name: "Debugging auth",
        stats: expect.objectContaining({ totalRequests: 2, errorCount: 1 }),
      }),
    ]);
    expect(screen.queryByLabelText("Session name")).toBeNull();
  });

  it("says why Studio refused a save and keeps the dialog to retry from", async () => {
    /* One more request than a session holds. */
    const requests = Array.from({ length: 10_001 }, (_, i) => trafficRequest({ id: `req-${i}` }));
    useStudioStore.setState({ requests });
    await startStudio();
    render(<Harness />);
    await screen.findByText("0 saved sessions");

    await saveSession("Debugging auth");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save the session: A session holds at most 10000 requests.",
      ),
    );
    expect(screen.getByLabelText("Session name")).toBeTruthy();
    expect(screen.getByText("0 saved sessions")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
