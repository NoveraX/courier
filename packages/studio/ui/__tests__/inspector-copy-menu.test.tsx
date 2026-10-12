/**
 * @vitest-environment jsdom
 *
 * The inspector's "⋯" menu: every way to copy or download the request a
 * row's right-click menu offers, so a finger with no right click finds
 * them too — and what a pick of one copies.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
const copy = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copy }));

const inspector = () => screen.getByRole("complementary", { name: "Request inspector" });

beforeEach(() => {
  copy.mockClear();
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [requestEntry({ id: "ok" })],
    heldRequests: [],
    paused: false,
    shownSession: null,
  });
});

afterEach(cleanup);

describe("the inspector's ⋯ menu", () => {
  it("offers every way to copy or download the request", async () => {
    await openShell("/timeline?req=ok");
    const more = within(inspector()).getByRole("button", { name: "Copy or download the request" });

    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" });

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Copy as cURL",
      "Copy as fetch",
      "Copy as JSON",
      "Download JSON",
    ]);
  });

  it("copies the request as the item picked says", async () => {
    await openShell("/timeline?req=ok");
    const more = within(inspector()).getByRole("button", { name: "Copy or download the request" });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" });

    fireEvent.click(screen.getByRole("menuitem", { name: "Copy as fetch" }));

    expect(copy).toHaveBeenCalledWith(expect.stringContaining("fetch("), "as fetch");
  });

  it("keeps the head's own cURL button, which copies the same command", async () => {
    await openShell("/timeline?req=ok");

    fireEvent.click(within(inspector()).getByTitle("Copy as cURL"));

    expect(copy).toHaveBeenCalledWith(expect.stringContaining("curl"), "as cURL");
  });
});
