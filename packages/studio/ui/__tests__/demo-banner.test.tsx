/**
 * @vitest-environment jsdom
 *
 * The demo banner's single line, for a phone or a phone held sideways: the
 * demo and when it resets, a way to run Studio on one's own project, and a
 * toggle that opens the rest of what the banner says.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as StudioTokenModule from "@/lib/studio-token";

vi.mock("@/lib/studio-token", async (importOriginal) => ({
  ...(await importOriginal<typeof StudioTokenModule>()),
  studioToken: () => null,
}));

import { DemoBanner } from "@/shell/demo-banner";
import { useStudioStore } from "@/store";

const NOW = Date.UTC(2026, 9, 5, 17, 22);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  useStudioStore.setState({
    studioInfo: {
      version: "1.0.0",
      startedAt: NOW - 60_000,
      project: { name: "demo-shop", dependencies: [] },
      demo: { resetsAt: NOW + 37.5 * 60_000 },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the demo banner's single line", () => {
  it("names the demo, when it resets, and the way to run Studio on one's own project", () => {
    render(<DemoBanner />);

    const toggle = screen.getByRole("button", { name: /^Live demo · resets in 38 min/ });
    const banner = within(screen.getByRole("complementary", { name: "Live demo" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(banner.getByRole("link", { name: "Run your own" }).getAttribute("href")).toBe(
      "https://courier.noverax.cloud/docs/studio/overview#install",
    );
  });

  it("opens to the rest of what the banner says, and closes again", () => {
    render(<DemoBanner />);
    const toggle = screen.getByRole("button", { name: /^Live demo/ });

    fireEvent.click(toggle);

    const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(details?.textContent).toContain("Everyone here shares one project");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
