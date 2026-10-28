/**
 * @vitest-environment jsdom
 *
 * An answer long enough to draw only the rows in sight takes Command+F
 * (Ctrl+F off a Mac) to its own search after a click in it, in the tree
 * and in the raw text: the browser's find would see only the rows drawn.
 * A short answer, drawn whole, leaves the browser's find alone.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apple-platform", () => ({ isApplePlatform: () => true }));

import type { PayloadView } from "@/features/requests/payload-view";
import { PayloadTab } from "@/inspector/tabs/payload-tab";

afterEach(cleanup);

/* Four lines an item, in the raw text and in the tree: 200 items are 802 lines, 20 are 82. */
function users(count: number): PayloadView {
  return {
    value: Array.from({ length: count }, (_, at) => ({ id: at, name: `User ${at}` })),
    chips: [],
    issues: new Map(),
  };
}

const COMMAND_F = { key: "f", code: "KeyF", metaKey: true };
const field = () => screen.getByRole("searchbox", { name: "Find in the answer" });

function clickFirstUser(): void {
  const [first] = screen.getAllByText(/User 0\b/);
  if (!first) throw new Error("The answer shows no first user");
  fireEvent.pointerDown(first);
}

describe("Command+F in an answer", () => {
  it.each(["tree", "raw"] as const)(
    "brings Find in the answer to hand in a long answer's %s view",
    (mode) => {
      render(
        <PayloadTab
          view={users(200)}
          mode={mode}
          onMode={vi.fn()}
          searchLabel="Find in the answer"
        />,
      );
      clickFirstUser();

      const taken = !fireEvent.keyDown(document.body, COMMAND_F);

      expect(taken).toBe(true);
      expect(document.activeElement).toBe(field());
    },
  );

  it("leaves the browser's find alone in a short answer", () => {
    render(
      <PayloadTab view={users(20)} mode="tree" onMode={vi.fn()} searchLabel="Find in the answer" />,
    );
    clickFirstUser();

    const taken = !fireEvent.keyDown(document.body, COMMAND_F);

    expect(taken).toBe(false);
    expect(document.activeElement).not.toBe(field());
  });
});
