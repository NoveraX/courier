/**
 * @vitest-environment jsdom
 *
 * The count over the Timeline: requests while every call sent its own, and
 * calls beside the requests they sent once another call's request answered
 * some — filtered, of how many calls.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TimelineCount } from "@/screens/timeline/timeline-count";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const sent = requestEntry({ id: "sent" });
const joined = requestEntry({ id: "joined", shared: { by: "flight", with: "sent" } });
const other = requestEntry({ id: "other", method: "get" });

afterEach(cleanup);

function countWith(requests: ReturnType<typeof requestEntry>[], shown: number): string {
  useStudioStore.setState({ connectionStatus: "connected", requests });
  return render(<TimelineCount shown={shown} />).container.textContent ?? "";
}

describe("the Timeline's count", () => {
  it("counts requests while every call sent its own", () => {
    expect(countWith([sent, other], 2)).toBe("2 requests");
    expect(countWith([sent, other], 1)).toBe("1 of 2 requests");
  });

  it("counts the calls and the requests they sent once another call's request answered one", () => {
    expect(countWith([joined, sent, other], 3)).toBe("3 calls · 2 requests");
    expect(countWith([joined, sent, other], 1)).toBe("1 of 3 calls");
  });
});
