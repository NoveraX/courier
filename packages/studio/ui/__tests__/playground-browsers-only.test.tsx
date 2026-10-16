/**
 * @vitest-environment jsdom
 *
 * A Proxy-mode run the app's `browsersOnly` refused says why above the
 * answer, and offers the run as server code: Studio's one-time pass did
 * not carry it, because the route runs where the pass is not redeemed. Any
 * other answer, and the same refusal of a Direct-mode run, says nothing of
 * the kind.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

import { refusedByBrowsersOnly } from "@/features/playground/browsers-only-refusal";
import { ResponseContent } from "@/screens/playground/response-content";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { BROWSERS_ONLY_ADVICE } from "../../../studio-core/src/runtime/browsers-only-refusal";

const REFUSAL = {
  success: false,
  message: "This proxy answers browsers only",
  code: "BROWSERS_ONLY",
};

function entry(overrides: Partial<PlaygroundHistoryEntry> = {}): PlaygroundHistoryEntry {
  return {
    id: "e1",
    rid: "e1",
    source: "api",
    group: "users",
    method: "list",
    variables: "{}",
    headers: "{}",
    mode: "proxy",
    timestamp: 1,
    status: "error",
    statusCode: 403,
    response: REFUSAL,
    ...overrides,
  };
}

function show(run: PlaygroundHistoryEntry, onRunAsServer?: () => void): void {
  render(
    <ResponseContent
      entry={run}
      row={undefined}
      tab="body"
      payload={{ mode: "tree", onMode: () => {} }}
      now={Date.now()}
      sendingLabel=""
      onCancel={() => {}}
      onRunAsServer={onRunAsServer}
    />,
  );
}

afterEach(cleanup);

describe("refusedByBrowsersOnly", () => {
  it("knows the proxy's browsersOnly refusal of a Proxy-mode HTTP run", () => {
    expect(refusedByBrowsersOnly(entry())).toBe(true);
  });

  it("knows nothing else for it", () => {
    expect(refusedByBrowsersOnly(null)).toBe(false);
    expect(refusedByBrowsersOnly(entry({ mode: "direct" }))).toBe(false);
    expect(refusedByBrowsersOnly(entry({ statusCode: 401 }))).toBe(false);
    expect(refusedByBrowsersOnly(entry({ response: { code: "NOT_EXPOSED" } }))).toBe(false);
    expect(refusedByBrowsersOnly(entry({ response: "BROWSERS_ONLY" }))).toBe(false);
    expect(refusedByBrowsersOnly(entry({ transport: "sse" }))).toBe(false);
  });
});

describe("a Proxy-mode run browsersOnly refused", () => {
  it("says why above the answer, with the three ways past it", () => {
    show(entry());
    const note = screen.getByRole("note");

    expect(note.textContent).toContain("browsersOnly refused this call");
    expect(note.textContent).toContain("did not redeem Studio's one-time pass");
    expect(note.textContent).toContain("Run the call in Direct mode");
    expect(note.textContent).toContain('browsersOnly: process.env.NODE_ENV === "production"');
    expect(note.textContent).toContain("on the Node runtime");
    expect(note.textContent).toContain("a proxy in front of the route takes its header off");
    expect(note.textContent).toContain("more than 30 seconds later");
    expect(note.textContent).toContain("more than 256 calls are in flight");
    expect(note.textContent).toContain("send the call again");
  });

  it("names every place the runtime's own advice names, where no pass is redeemed", () => {
    show(entry());
    const note = screen.getByRole("note").textContent ?? "";
    /* The advice lists them between "— not " and the next "—": "an Edge route, workerd, … or …". */
    const listed = /— not (.+?) —/.exec(BROWSERS_ONLY_ADVICE)?.[1] ?? "";
    const places = listed.split(/, | or /).map((place) => place.replace(/^an? /, ""));

    expect(places.length).toBeGreaterThanOrEqual(4);
    for (const place of places) expect(note).toContain(place);
  });

  it("runs the call as server code from the notice", () => {
    const onRunAsServer = vi.fn();
    show(entry(), onRunAsServer);

    fireEvent.click(screen.getByRole("button", { name: "Run in Direct mode" }));

    expect(onRunAsServer).toHaveBeenCalledOnce();
  });

  it("offers no run while a call is under way", () => {
    show(entry());

    expect(screen.getByRole("button", { name: "Run in Direct mode" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("says nothing of the kind for another answer", () => {
    show(entry({ statusCode: 200, status: "success", response: { id: 1 } }));

    expect(screen.queryByRole("note")).toBeNull();
  });
});
