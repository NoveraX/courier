/**
 * @vitest-environment jsdom
 */
/**
 * Settings → Session History against a real Studio server: Save current
 * sends the requests this page recorded, the session lands in the
 * project's `.courier/sessions` and is listed, and a save Studio refuses
 * says why and keeps the dialog open.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { createStudioServer } from "../../src/server/create-studio-server";
import type { StudioServer } from "../../src/server/types";
import { useStudioStore } from "@/store";
import { SessionHistorySection } from "../src/views/settings/session-history-section";
import { useSessionHistory } from "../src/views/settings/use-session-history";
import { trafficRequest } from "./playground-fixtures";

let root: string;
let studio: StudioServer | undefined;

function Harness(): React.ReactElement {
  return <SessionHistorySection history={useSessionHistory()} />;
}

async function startStudio(): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
  /* The page is served by Studio, so the browser resolves its relative API URLs against Studio. */
  const nodeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    nodeFetch(typeof input === "string" ? new URL(input, url) : input, init));
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
  useStudioStore.setState({ requests: [trafficRequest(), trafficRequest({ id: "req-2", status: "error" })] });
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
    const [file] = readdirSync(join(root, ".courier/sessions"));
    const saved: unknown = JSON.parse(readFileSync(join(root, ".courier/sessions", file ?? ""), "utf-8"));
    expect(saved).toMatchObject({ name: "Debugging auth", stats: { totalRequests: 2, errorCount: 1 } });
    expect(screen.queryByLabelText("Session name")).toBeNull();
  });

  it("says why Studio refused a save and keeps the dialog to retry from", async () => {
    useStudioStore.setState({ requests: [trafficRequest({ data: "x".repeat(6 * 1024 * 1024) })] });
    await startStudio();
    render(<Harness />);
    await screen.findByText("0 saved sessions");

    await saveSession("Debugging auth");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save the session: The request body is larger than Studio accepts.",
      ),
    );
    expect(screen.getByLabelText("Session name")).toBeTruthy();
    expect(screen.getByText("0 saved sessions")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
