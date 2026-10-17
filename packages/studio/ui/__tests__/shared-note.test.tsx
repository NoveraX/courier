/**
 * @vitest-environment jsdom
 *
 * A call whose read another call's request answered says so first in the
 * inspector: that it sent no request of its own and how it was answered,
 * with the call whose request answered one click away while Studio keeps
 * it. A call that sent its own request says nothing of the kind.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const socket = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }));
vi.mock("@/socket", () => ({ getSocket: () => socket }));

const sent = requestEntry({ id: "sent", startedAt: 1_000 });
const joined = requestEntry({
  id: "joined",
  startedAt: 1_200,
  shared: { by: "flight", with: "sent" },
});
const replayed = requestEntry({
  id: "replayed",
  startedAt: 1_900,
  shared: { by: "render", with: "gone" },
});

const inspector = () => screen.getByRole("complementary", { name: "Request inspector" });

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [replayed, joined, sent],
    heldRequests: [],
    paused: false,
  });
});

afterEach(cleanup);

describe("a call another call's request answered", () => {
  it("says it joined the read in flight, and opens the call whose request answered it", async () => {
    const router = await openShell("/timeline?req=joined");
    const note = within(inspector()).getByRole("note");

    expect(note.textContent).toContain(
      "It sent no request of its own: it joined the identical read already in flight, and that call's request answered both.",
    );
    await act(async () => {
      fireEvent.click(within(note).getByRole("button", { name: "Open that call" }));
    });
    expect(router.state.location.search).toMatchObject({ req: "sent" });
  });

  it("says the render had read it already, and offers no call Studio no longer keeps", async () => {
    await openShell("/timeline?req=replayed");
    const note = within(inspector()).getByRole("note");

    expect(note.textContent).toContain(
      "It sent no request: the render it was made in had read this already, and that read's answer came back to it.",
    );
    expect(within(note).queryByRole("button")).toBeNull();
  });

  it("says nothing of the kind for a call that sent its own request", async () => {
    await openShell("/timeline?req=sent");

    expect(within(inspector()).queryByRole("note")).toBeNull();
  });
});
