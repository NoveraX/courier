/**
 * @vitest-environment jsdom
 *
 * Choosing the Playground's endpoint from its list: variables typed
 * straight after go into the editor, not onto the button that opened the
 * list — the button takes the focus back a moment after the list has gone,
 * and only when nothing else took it in that moment.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { API, BOUND } from "./playground-fixtures";
import { openShell } from "./shell-harness";

beforeEach(() => {
  usePlaygroundDrafts.setState({ variables: {}, headers: undefined, mode: "direct" });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    received: { runtimes: true, requests: true },
    scanSources: [API],
    bindingSnapshot: BOUND,
    requests: [],
    heldRequests: [],
    playgroundHistory: [],
    playgroundActiveResponse: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const picker = (key: string): HTMLElement =>
  screen.getByRole("button", { name: `Endpoint: ${key}` });

/* Opens the list and searches it, as a person does; the search keeps the focus. */
async function searchList(from: string, query: string): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(picker(from));
  });
  const search = screen.getByPlaceholderText(/^Search \d+ endpoints/);
  fireEvent.change(search, { target: { value: query } });
  return search;
}

/* jsdom plays no exit animation: Enter takes the list off the page at once, and the button takes
   the focus back only once the timers run, which a test holds back as the moment to type in. */
async function pressEnterHoldingTimers(search: HTMLElement): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await act(async () => {
    fireEvent.keyDown(search, { key: "Enter" });
  });
}

describe("choosing an endpoint from the Playground's list", () => {
  it("leaves the focus in the variables they are typed into straight after", async () => {
    await openShell("/playground?endpoint=api.users.byId");
    const search = await searchList("api.users.byId", "users.search");

    await pressEnterHoldingTimers(search);
    const variables = screen.getByRole("textbox", { name: "Variables" });
    expect(picker("api.users.search")).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    variables.focus();
    act(() => vi.runOnlyPendingTimers());

    expect(document.activeElement).toBe(variables);
  });

  it("gives the focus back to the list's button when nothing else took it", async () => {
    await openShell("/playground?endpoint=api.users.byId");
    const search = await searchList("api.users.byId", "users.search");

    await pressEnterHoldingTimers(search);
    expect(document.activeElement).toBe(document.body);
    act(() => vi.runOnlyPendingTimers());

    expect(document.activeElement).toBe(picker("api.users.search"));
  });
});
