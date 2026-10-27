/**
 * @vitest-environment jsdom
 *
 * Lines of code: a short text draws every line, one after another; a long
 * one — a large answer's raw text — draws the lines its pane shows and
 * twenty past either edge, each numbered and placed as in the whole text,
 * keeps the search's current line drawn wherever the pane is scrolled,
 * and is as wide as its longest line whichever lines are drawn; past
 * 9,999 lines, the numbers' column widens to hold five digits.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { layOutPane } from "./pane-layout";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function usersText(count: number): string {
  const users = Array.from({ length: count }, (_, at) => ({
    id: `u${at}`,
    name: at === count - 1 ? "Grace Hopper" : `User ${at}`,
    email: `user${at}@example.com`,
    role: "member",
  }));
  return JSON.stringify(users, null, 2);
}

/* Six lines a user, and the brackets around them all. */
const LONG = usersText(2_000);
const ROW = 20;

function numbers(root: ParentNode): number[] {
  return [...root.querySelectorAll("[data-line]")].map((line) =>
    Number(line.getAttribute("data-line")),
  );
}

describe("lines of code", () => {
  it("draws every line of a text of five hundred lines or fewer, one after another", () => {
    const { container } = render(
      <CodeLines code={usersText(80)} tokenize={tokenizeJsonLine} variant="panel" />,
    );

    expect(numbers(container)).toEqual(Array.from({ length: 482 }, (_, at) => at + 1));
    expect(container.querySelector(".relative")).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-line="2"]')?.style.top).toBe("");
  });

  it("draws the lines its pane shows of a long text, and twenty past its edge", () => {
    const pane = layOutPane({ height: 400, rowHeight: ROW });
    render(<CodeLines code={LONG} tokenize={tokenizeJsonLine} variant="panel" />, {
      container: pane.element,
    });

    expect(numbers(pane.element)).toEqual(Array.from({ length: 41 }, (_, at) => at + 1));
    expect(pane.element.querySelector<HTMLElement>(".relative")?.style.height).toBe(
      `${12_002 * ROW}px`,
    );
  });

  it("numbers and places the lines as in the whole text, wherever the pane is scrolled", () => {
    const pane = layOutPane({ height: 400, rowHeight: ROW });
    render(<CodeLines code={LONG} tokenize={tokenizeJsonLine} variant="panel" />, {
      container: pane.element,
    });

    act(() => pane.scrollTo(12_002 * ROW - 400));

    const last = pane.element.querySelector<HTMLElement>('[data-line="12002"]');
    expect(numbers(pane.element)[0]).toBe(11_963);
    expect(last?.textContent).toBe("12002]");
    expect(last?.style.top).toBe(`${12_001 * ROW}px`);
  });

  it("keeps the search's current line drawn and outlined wherever the pane is scrolled", () => {
    const pane = layOutPane({ height: 400, rowHeight: ROW });
    render(
      <CodeLines
        code={LONG}
        tokenize={tokenizeJsonLine}
        variant="panel"
        current={11_998}
        isHighlighted={(line) => line.includes("Grace Hopper")}
      />,
      { container: pane.element },
    );

    const current = pane.element.querySelector('[aria-current="true"]');
    expect(current?.getAttribute("data-line")).toBe("11998");
    expect(current?.textContent).toContain('"name": "Grace Hopper"');
    expect(current?.className).toContain("bg-brand-tint");
  });

  it("widens the numbers' column for a text that runs past 9,999 lines", () => {
    const pane = layOutPane({ height: 400, rowHeight: ROW });
    render(<CodeLines code={LONG} tokenize={tokenizeJsonLine} variant="panel" />, {
      container: pane.element,
    });
    const short = render(<CodeLines code={usersText(80)} tokenize={tokenizeJsonLine} />);

    const number = (root: ParentNode) => root.querySelector<HTMLElement>('[data-line="1"] > span');
    expect(number(pane.element)?.style.width).toBe("calc(5ch + 0.875rem)");
    expect(number(short.container)?.style.width).toBe("");
  });

  it("is as wide as its longest line, whichever lines are drawn", () => {
    const pane = layOutPane({ height: 400, rowHeight: ROW });
    const code = `${LONG}\n${"x".repeat(900)}`;
    render(<CodeLines code={code} tokenize={tokenizeJsonLine} variant="panel" />, {
      container: pane.element,
    });

    expect(pane.element.querySelector('[data-line="12003"]')).toBeNull();
    expect(pane.element.querySelector<HTMLElement>(".relative")?.style.minWidth).toContain("900ch");
  });
});
