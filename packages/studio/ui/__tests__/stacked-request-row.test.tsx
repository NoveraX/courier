/**
 * @vitest-environment jsdom
 *
 * A Timeline row on two lines, as a list too narrow for columns shows it:
 * the method, name and status over the path, the duration and the time,
 * a pin while pinned, its state for a screen reader, and a tap opening it.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StackedRequestRow } from "@/screens/timeline/request-row-stacked";
import type { RowContext } from "@/screens/timeline/row-values";
import { requestEntry } from "./request-entry-fixture";

afterEach(cleanup);

const NOW = 2_000_000;
const context: RowContext = { now: NOW, slowMs: 500, timestamps: "relative", wide: false };

function show(fields: Parameters<typeof requestEntry>[0] = {}, onSelect = vi.fn()) {
  const request = requestEntry({ id: "r1", startedAt: NOW - 30_000, ...fields });
  render(
    <StackedRequestRow request={request} selected={false} context={context} onSelect={onSelect} />,
  );
  return screen.getByRole("button");
}

describe("StackedRequestRow", () => {
  it("names the method, the endpoint and the status on its first line", () => {
    const row = show({ httpMethod: "POST", method: "create", statusCode: 201 });
    const [method, name, status] = [...row.children].slice(1, 4);

    expect(method?.textContent).toBe("POST");
    expect(name?.textContent).toBe("api.users.create");
    expect(name?.className).toContain("truncate");
    expect(status?.textContent).toBe("201");
  });

  it("puts the path, how long it took and when it began on its second line", () => {
    const row = show({ url: "http://localhost:5173/api/users?page=2" });
    const [path, figures] = [...row.children].slice(4, 6);

    expect(path?.textContent).toBe("/api/users?page=2");
    expect(path?.className).toContain("col-start-2");
    expect(path?.className).toContain("truncate");
    expect(figures?.textContent).toBe("120ms30s ago");
  });

  it("marks a pinned request beside its status, and says its state to a screen reader", () => {
    const row = show({ pinned: true, status: "error", statusCode: 404 });

    expect(row.querySelector("svg.lucide-pin")).not.toBeNull();
    expect(row.textContent).toContain("404");
    expect(row.querySelector(".sr-only")?.textContent).toBe("Error, pinned");
  });

  it("opens its request when tapped, carrying its id for the row menu", () => {
    const onSelect = vi.fn();
    const row = show({}, onSelect);

    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith("r1");
    expect(row.getAttribute("data-request-id")).toBe("r1");
  });

  it("is tall enough for its two lines, and for a finger", () => {
    expect(show().className).toContain("h-13");
  });
});
