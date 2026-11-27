/**
 * Progress betters a download and never decides it. A call that reports
 * its download loads what counts the answer alongside the request; where
 * that does not load — a deployment took its chunk away, a policy kept it
 * out — the call resolves to its answer uncounted, said once, and no retry
 * runs for the missing code. A page that never reports a download never
 * loads it at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";

vi.mock("../src/utils/progress", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const { endpoint } = courier();
const ROWS = { rows: "naïve café ✓" };

function api() {
  return defineApi({
    name: "files",
    baseURL: "https://api.example.com",
    endpoints: {
      rows: endpoint.get("rows").response<typeof ROWS>(),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a download whose counting did not load", () => {
  it("resolves to its answer uncounted, said once for a read and a stream, each sent once", async () => {
    const sent = vi.fn(async () => Response.json(ROWS));
    vi.stubGlobal("fetch", sent);
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const heard = vi.fn();
    const caller = createCaller(api());

    const read = await caller.rows.with({ onDownloadProgress: heard })();
    const stream = await caller.with({ stream: true, onDownloadProgress: heard }).rows();

    expect(read).toEqual(ROWS);
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(await new Response(stream as unknown as ReadableStream).json()).toEqual(ROWS);
    expect(heard).not.toHaveBeenCalled();
    expect(sent).toHaveBeenCalledTimes(2);
    const said = warned.mock.calls.filter((args) =>
      args.join(" ").includes("progress reporting did not load"),
    );
    expect(said).toHaveLength(1);
  });
});
