/**
 * What Studio tells the pages of the files it watches: how many, and since
 * when it watches that many — its start, or the latest change of the count —
 * to every page at once and to each page that connects.
 */
import type { Namespace, Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWatcherStatus } from "../src/server/watcher-status";

function recorder(): { emit: (event: string, data: unknown) => boolean; sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    emit: (event, data) => {
      if (event === "watcher:status") sent.push(data);
      return true;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createWatcherStatus", () => {
  it("says since when it watches as many files: its start, then each change of the count", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const pages = recorder();
    const page = recorder();
    const status = createWatcherStatus(pages as unknown as Namespace);

    vi.setSystemTime(2_000);
    status.sendSnapshot(page as unknown as Socket);
    vi.setSystemTime(3_000);
    status.setApiPathCount(3);
    vi.setSystemTime(4_000);
    status.setApiPathCount(3);

    expect(page.sent).toEqual([{ apiPaths: 0, since: 1_000 }]);
    expect(pages.sent).toEqual([{ apiPaths: 3, since: 3_000 }]);
  });
});
