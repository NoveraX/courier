/**
 * @vitest-environment jsdom
 *
 * The rows of a JSON tree: a short tree draws every row; a long one — a
 * large answer — draws the rows its pane shows and twenty past either
 * edge, each where it sits in the whole tree, more as the pane scrolls,
 * and keeps the search's current match and the focused row drawn wherever
 * the pane is scrolled. Where no pane scrolls it, every row is drawn.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonTreeRows } from "@/features/requests/json-tree";
import { TreeRows } from "@/inspector/tree-rows";
import { layOutPane } from "./pane-layout";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* Users as a list answers them: six rows each, its opening, its four fields and its closing. */
function usersTree(count: number) {
  const users = Array.from({ length: count }, (_, at) => ({
    id: `u${at}`,
    name: `User ${at}`,
    email: `user${at}@example.com`,
    role: "member",
  }));
  return jsonTreeRows(users, new Set(), new Map());
}

const LONG = usersTree(2_000);

function drawn(root: ParentNode): string[] {
  return [...root.querySelectorAll("[data-row]")].map((row) => row.getAttribute("data-row") ?? "");
}

describe("the rows of a JSON tree", () => {
  it("draws every row of a tree of five hundred rows or fewer", () => {
    const rows = usersTree(80);
    const { container } = render(
      <TreeRows rows={rows} query="" current={undefined} onToggle={vi.fn()} />,
    );

    expect(rows).toHaveLength(482);
    expect(drawn(container)).toHaveLength(482);
  });

  it("draws the rows its pane shows of a long tree, and twenty past its edge", () => {
    const pane = layOutPane({ height: 500, rowHeight: 25 });
    render(<TreeRows rows={LONG} query="" current={undefined} onToggle={vi.fn()} />, {
      container: pane.element,
    });

    expect(LONG).toHaveLength(12_002);
    expect(drawn(pane.element)).toHaveLength(41);
    expect(drawn(pane.element)[0]).toBe("open:");
    expect(pane.element.querySelector('[data-path="1999.name"]')).toBeNull();
  });

  it("places each row where it sits in the whole tree, in a list as tall as all of them", () => {
    const pane = layOutPane({ height: 500, rowHeight: 25 });
    render(<TreeRows rows={LONG} query="" current={undefined} onToggle={vi.fn()} />, {
      container: pane.element,
    });
    const row = pane.element.querySelector<HTMLElement>('[data-row="value:1.name"]');

    expect(row?.style.top).toBe(`${9 * 25}px`);
    expect(row?.parentElement?.style.height).toBe(`${12_002 * 25}px`);
  });

  it("draws the rows further down as the pane scrolls, and lets go of those it passed", () => {
    const pane = layOutPane({ height: 500, rowHeight: 25 });
    render(<TreeRows rows={LONG} query="" current={undefined} onToggle={vi.fn()} />, {
      container: pane.element,
    });

    act(() => pane.scrollTo(6_000 * 25));

    const rows = drawn(pane.element);
    expect(rows[0]).toBe(`value:${LONG[5_980]?.path}`);
    expect(rows).toHaveLength(61);
    expect(rows).not.toContain("open:");
    expect(pane.element.querySelector('[data-path="1000.name"]')).not.toBeNull();
  });

  it("keeps the search's current match drawn wherever the pane is scrolled", () => {
    const pane = layOutPane({ height: 500, rowHeight: 25 });
    render(<TreeRows rows={LONG} query="user 1999" current="1999.name" onToggle={vi.fn()} />, {
      container: pane.element,
    });

    const match = pane.element.querySelector('[aria-current="true"]');
    expect(match?.getAttribute("data-path")).toBe("1999.name");
    expect(match?.querySelector("mark")?.textContent).toBe("User 1999");
  });

  it("keeps the row that holds the focus drawn as the pane scrolls away from it", () => {
    const pane = layOutPane({ height: 500, rowHeight: 25 });
    render(<TreeRows rows={LONG} query="" current={undefined} onToggle={vi.fn()} />, {
      container: pane.element,
    });
    const toggle = pane.element.querySelector<HTMLButtonElement>('[data-row="open:3"] button');
    act(() => toggle?.focus());

    act(() => pane.scrollTo(6_000 * 25));

    expect(drawn(pane.element)).toContain("open:3");
    expect(document.activeElement).toBe(toggle);
  });

  it("draws every row where no pane scrolls the tree", () => {
    layOutPane({ height: 500, rowHeight: 25 });
    const rows = usersTree(100);
    const { container } = render(
      <TreeRows rows={rows} query="" current={undefined} onToggle={vi.fn()} />,
    );

    expect(drawn(container)).toHaveLength(602);
  });

  it("places the rows by the height they are drawn at", () => {
    const pane = layOutPane({ height: 500, rowHeight: 32 });
    render(<TreeRows rows={LONG} query="" current={undefined} onToggle={vi.fn()} />, {
      container: pane.element,
    });
    const row = pane.element.querySelector<HTMLElement>('[data-row="value:1.name"]');

    expect(row?.style.top).toBe(`${9 * 32}px`);
    expect(drawn(pane.element)).toHaveLength(37);
  });
});
