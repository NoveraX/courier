/**
 * @vitest-environment jsdom
 *
 * A search in a request's answer: the tree keeps what matches and what
 * holds it, with the text marked; the count says which match is current,
 * and Enter and Shift+Enter move through them; the raw view marks the
 * lines; each row copies its path; and the headers' filter is marked too.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HighlightMatch } from "@/design/highlight-match";
import type { PayloadView } from "@/features/requests/payload-view";
import { PayloadTab } from "@/inspector/tabs/payload-tab";

afterEach(cleanup);

const VIEW: PayloadView = {
  value: {
    cities: [
      { id: 1, name: "Kazan" },
      { id: 2, name: "Samara" },
      { id: 3, name: "Kazan-on-Volga" },
    ],
  },
  chips: [],
  issues: new Map(),
};

function search(text: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Find in the answer" }), {
    target: { value: text },
  });
}

describe("a search in the answer's tree", () => {
  it("keeps what matches, marks it, and counts the matches", () => {
    const { container } = render(
      <PayloadTab view={VIEW} mode="tree" onMode={vi.fn()} searchLabel="Find in the answer" />,
    );

    search("kazan");

    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
      "Kazan",
      "Kazan",
    ]);
    expect(container.textContent).not.toContain("Samara");
    expect(container.querySelector('[aria-current="true"]')?.getAttribute("data-path")).toBe(
      "cities.0.name",
    );
  });

  it("moves to the next match on Enter, the previous on Shift+Enter, round the ends", () => {
    const { container } = render(
      <PayloadTab view={VIEW} mode="tree" onMode={vi.fn()} searchLabel="Find in the answer" />,
    );
    search("kazan");
    const field = screen.getByRole("searchbox", { name: "Find in the answer" });
    const current = () =>
      container.querySelector('[aria-current="true"]')?.getAttribute("data-path");

    fireEvent.keyDown(field, { key: "Enter" });
    expect(current()).toBe("cities.2.name");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(current()).toBe("cities.0.name");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(current()).toBe("cities.2.name");
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("says when nothing matches, and clears with Escape", () => {
    render(
      <PayloadTab view={VIEW} mode="tree" onMode={vi.fn()} searchLabel="Find in the answer" />,
    );

    search("omsk");
    expect(screen.getByText("No matches")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });

    expect(screen.queryByText("No matches")).toBeNull();
    expect(screen.getByText('"Samara"')).toBeTruthy();
  });

  it("offers each row's path in code to copy", () => {
    render(
      <PayloadTab view={VIEW} mode="tree" onMode={vi.fn()} searchLabel="Find in the answer" />,
    );

    expect(screen.getByRole("button", { name: "Copy the path cities[1].name" })).toBeTruthy();
  });
});

describe("a search in the answer's raw text", () => {
  it("marks the lines that hold it, the current one outlined", () => {
    const { container } = render(
      <PayloadTab view={VIEW} mode="raw" onMode={vi.fn()} searchLabel="Find in the answer" />,
    );

    search("samara");

    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(container.querySelector('[aria-current="true"]')?.textContent).toContain('"Samara"');
  });
});

describe("HighlightMatch", () => {
  it("marks every place the text is found, whatever its case", () => {
    const { container } = render(<HighlightMatch text="x-Request-ID: req-1" query="REQ" />);

    expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
      "Req",
      "req",
    ]);
    expect(container.textContent).toBe("x-Request-ID: req-1");
  });
});
