/**
 * @vitest-environment jsdom
 *
 * The Explorer Overview's activity lists the latest calls first, as the
 * store holds them, and opens the one picked.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "@/screens/explorer/activity-feed";
import { requestEntry } from "./request-entry-fixture";

/* Newest first, as the store holds them. */
const CAPTURED = Array.from({ length: 60 }, (_, i) =>
  requestEntry({ id: `r${i}`, statusCode: 200 + i, startedAt: 1_000 + i }),
).reverse();

afterEach(cleanup);

describe("the Overview's activity", () => {
  it("lists the latest calls, newest first, and opens the one picked", () => {
    const onOpen = vi.fn();
    render(<ActivityFeed requests={CAPTURED} now={2_000} slowMs={500} live onOpen={onOpen} />);

    const rows = screen.getAllByRole("button");
    const codes = rows.map((row) => row.textContent?.match(/2\d\d/)?.[0]);
    expect(codes.slice(0, 3)).toEqual(["259", "258", "257"]);
    expect(rows).toHaveLength(14);
    const [newest] = rows;
    if (!newest) throw new Error("The activity lists no call");
    fireEvent.click(newest);
    expect(onOpen).toHaveBeenCalledWith("r59");
  });
});
